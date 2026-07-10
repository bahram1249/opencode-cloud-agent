import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WorkflowEngine } from './workflow-engine.service';
import { WorkflowState, WorkflowEvent, AppEvents } from 'src/common/constants/workflow.constants';
import { TaskService } from '../task/task.service';
import { OpenCodeService } from '../opencode/opencode.service';
import { BuildService } from '../build/build.service';
import { GitService } from '../git/git.service';
import { NotificationService } from '../notification/notification.service';
import { RepositoryService } from '../repository/repository.service';
import { ConfigService } from '@nestjs/config';
import type { NotificationPayload } from 'src/common/types';

@Injectable()
export class WorkflowOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(WorkflowOrchestrator.name);
  private readonly pendingApprovals = new Map<string, { chatId: string; diffSummary: string }>();

  constructor(
    private readonly engine: WorkflowEngine,
    private readonly taskService: TaskService,
    private readonly openCodeService: OpenCodeService,
    private readonly buildService: BuildService,
    private readonly gitService: GitService,
    private readonly notificationService: NotificationService,
    private readonly repositoryService: RepositoryService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.logger.log('Workflow orchestrator initialised');
  }

  @OnEvent(AppEvents.TaskCreated)
  async handleTaskCreated(payload: { taskId: string; publicId: string }): Promise<void> {
    this.logger.log(`New task received: ${payload.publicId}`);
    await this.runTask(payload.taskId).catch((err: unknown) => {
      this.logger.error(`Failed to run task ${payload.publicId}: ${(err as Error).message}`);
    });
  }

  async runTask(taskId: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;

    const chatId = task.createdBy;
    const timeoutMs = this.config.get<number>('app.taskTimeoutMs', 0);

    // Get the working directory: workspace path > repo path > pwd
    let cwd = process.cwd();
    if (task.workspace) {
      cwd = task.workspace.workDir;
    } else if (task.repository) {
      cwd = task.repository.path;
    }

    try {
      await this.engine.fire(taskId, WorkflowEvent.Start);
      await this.notify(taskId, chatId, 'info', 'Task Started', `Prompt: ${task.prompt}\nWorking dir: ${cwd}`);

      await this.engine.fire(taskId, WorkflowEvent.CodingStarted);
      await this.taskService.transition(taskId, WorkflowState.Coding, { startedAt: new Date() });

      const openCodeResult = await this.openCodeService.executePrompt({
        taskId,
        prompt: task.prompt,
        cwd,
        profile: task.opencodeProfile ?? undefined,
        timeoutMs,
      });

      await this.taskService.recordExecution(taskId, {
        stage: 'opencode',
        command: openCodeResult.command,
        stdout: openCodeResult.stdout,
        stderr: openCodeResult.stderr,
        exitCode: openCodeResult.exitCode,
        durationMs: openCodeResult.durationMs,
        timedOut: openCodeResult.timedOut,
        cancelled: openCodeResult.cancelled,
        finishedAt: new Date(),
      });

      if (openCodeResult.cancelled) {
        await this.failTask(taskId, 'OpenCode execution was cancelled');
        return;
      }
      if (openCodeResult.exitCode !== 0) {
        await this.failTask(
          taskId,
          `OpenCode failed (exit ${openCodeResult.exitCode})`,
          openCodeResult.stderr.slice(-2000),
        );
        return;
      }

      await this.engine.fire(taskId, WorkflowEvent.CodingFinished);

      // Run the build pipeline only if a repository is configured with build commands
      if (task.repository) {
        const buildResult = await this.buildService.runPipeline({
          taskId,
          cwd,
          installCommand: task.repository.installCommand ?? undefined,
          lintCommand: task.repository.lintCommand ?? undefined,
          typecheckCommand: task.repository.typecheckCommand ?? undefined,
          buildCommand: task.repository.buildCommand ?? undefined,
          testCommand: task.repository.testCommand ?? undefined,
          timeoutMs,
        });

        await this.recordBuildExecutions(taskId, buildResult);

        if (!buildResult.success) {
          await this.engine.fire(taskId, WorkflowEvent.TestsFailed);
          const failedStage = buildResult.failedStage ?? 'test';
          const failedOutput = (buildResult as unknown as Record<string, unknown>)[failedStage];
          await this.failTask(
            taskId,
            `Build step "${buildResult.failedStage}" failed`,
            typeof failedOutput === 'object' && failedOutput !== null
              ? JSON.stringify(failedOutput)
              : String(failedOutput),
          );
          return;
        }
      } else {
        this.logger.log(`Task ${task.publicId}: no repository configured, skipping build pipeline`);
      }

      // ── Testing -> WaitingApproval (only if repo configured with approval policy) ──
      if (task.repository && task.repository.approvalPolicy !== 'skip') {
        await this.engine.fire(taskId, WorkflowEvent.ApprovalRequested);
        await this.notify(taskId, chatId, 'info', 'OpenCode Task Finished', 'OpenCode has finished making changes. Use /git diff to review changes, then /git commit and /git push manually.', []);

        // Mark as finished since git is now manual
        await this.engine.fire(taskId, WorkflowEvent.Finish);
        await this.taskService.transition(taskId, WorkflowState.Finished, { finishedAt: new Date() });
        await this.notify(taskId, chatId, 'success', 'Task Finished', 'OpenCode completed. Use /git commands to review, commit, and push changes.');
        this.events.emit(AppEvents.TaskFinished, { taskId, publicId: task.publicId });
      } else {
        // No approval needed, finish immediately
        await this.engine.fire(taskId, WorkflowEvent.Finish);
        await this.taskService.transition(taskId, WorkflowState.Finished, { finishedAt: new Date() });
        await this.notify(taskId, chatId, 'success', 'Task Finished', 'OpenCode completed successfully.');
        this.events.emit(AppEvents.TaskFinished, { taskId, publicId: task.publicId });
      }
    } catch (err) {
      await this.failTask(taskId, (err as Error).message);
    }
  }

  /** Legacy approve — kept for backward compat but git is now manual. */
  async approveTask(taskId: string, _chatId: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;

    const chatId = _chatId || task.createdBy;
    this.pendingApprovals.delete(taskId);

    try {
      await this.engine.fire(taskId, WorkflowEvent.Approved);
      await this.engine.fire(taskId, WorkflowEvent.Finish);
      await this.taskService.transition(taskId, WorkflowState.Finished, { finishedAt: new Date() });
      await this.notify(
        taskId, chatId, 'success', 'Task Approved',
        'OpenCode task approved. Use /git commands to review, commit, and push.',
      );
      this.events.emit(AppEvents.TaskFinished, { taskId, publicId: task.publicId });
    } catch (err) {
      await this.failTask(taskId, `Approval failed: ${(err as Error).message}`);
    }
  }

  async rejectTask(taskId: string, chatId: string): Promise<void> {
    this.pendingApprovals.delete(taskId);
    await this.engine.fire(taskId, WorkflowEvent.Rejected);
    await this.taskService.transition(taskId, WorkflowState.Failed, {
      errorMessage: 'Rejected by user',
      finishedAt: new Date(),
    });
    await this.notify(taskId, chatId, 'warn', 'Task Rejected', 'Changes were not committed.');
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;
    this.openCodeService.cancel(taskId);
    await this.engine.fire(taskId, WorkflowEvent.Cancel);
    await this.taskService.transition(taskId, WorkflowState.Failed, {
      errorMessage: 'Cancelled by user',
      finishedAt: new Date(),
    });
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.engine.fire(taskId, WorkflowEvent.Resume);
    await this.taskService.transition(taskId, WorkflowState.Pending);
    await this.runTask(taskId);
  }

  private async failTask(taskId: string, message: string, details?: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;
    const chatId = task.createdBy;

    this.logger.error(`Task ${task.publicId} failed: ${message}`);
    await this.taskService.transition(taskId, WorkflowState.Failed, {
      errorMessage: message,
      finishedAt: new Date(),
    });

    await this.taskService.addLog(taskId, 'error', message, details ? { details } : undefined);

    await this.notify(taskId, chatId, 'error', 'Task Failed', details ? `${message}\n${details}` : message);
    this.events.emit(AppEvents.TaskFailed, { taskId, publicId: task.publicId, message });
  }

  private async notify(
    taskId: string,
    chatId: string,
    level: NotificationPayload['level'],
    title: string,
    body?: string,
    buttons?: NotificationPayload['buttons'],
  ): Promise<void> {
    await this.notificationService.send({
      taskId,
      chatId,
      level,
      title,
      body,
      buttons,
    });
  }

  private async recordBuildExecutions(
    taskId: string,
    result: { install?: unknown; lint?: unknown; typecheck?: unknown; build?: unknown; test?: unknown },
  ): Promise<void> {
    for (const [stage, res] of Object.entries(result)) {
      if (res && typeof res === 'object' && 'command' in res) {
        const r = res as { command: string; stdout: string; stderr: string; exitCode: number | null; durationMs: number; timedOut: boolean; cancelled: boolean };
        await this.taskService.recordExecution(taskId, {
          stage,
          command: r.command,
          stdout: r.stdout,
          stderr: r.stderr,
          exitCode: r.exitCode,
          durationMs: r.durationMs,
          timedOut: r.timedOut,
          cancelled: r.cancelled,
          finishedAt: new Date(),
        });
      }
    }
  }
}
