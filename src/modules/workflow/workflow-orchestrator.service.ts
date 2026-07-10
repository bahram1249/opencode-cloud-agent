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

/**
 * Orchestrates the full task pipeline. Listens for new tasks, drives the FSM
 * through each stage (coding -> testing -> approval -> commit -> push), and
 * notifies Telegram at each step.
 *
 * Flow:
 *   Pending -> Running -> Coding -> Testing -> WaitingApproval
 *          -> Committing -> Pushing -> Finished (or Failed)
 */
@Injectable()
export class WorkflowOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(WorkflowOrchestrator.name);
  /** Pending approvals: taskId -> { chatId, diffSummary } */
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

  /**
   * Listen for newly created tasks and kick off the workflow.
   */
  @OnEvent(AppEvents.TaskCreated)
  async handleTaskCreated(payload: { taskId: string; publicId: string }): Promise<void> {
    this.logger.log(`New task received: ${payload.publicId}`);
    await this.runTask(payload.taskId).catch((err: unknown) => {
      this.logger.error(`Failed to run task ${payload.publicId}: ${(err as Error).message}`);
    });
  }

  /** Run the full pipeline for a task. */
  async runTask(taskId: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;

    const repo = await this.repositoryService.findById(task.repositoryId);
    if (!repo) {
      await this.failTask(taskId, 'Repository not found');
      return;
    }

    const chatId = task.createdBy;
    const timeoutMs = this.config.get<number>('app.taskTimeoutMs', 0);

    try {
      // ── Pending -> Running ─────────────────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.Start);
      await this.notify(taskId, chatId, 'info', 'Task Started', `Prompt: ${task.prompt}`);

      // ── Running -> Coding ──────────────────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.CodingStarted);
      await this.taskService.transition(taskId, WorkflowState.Coding, { startedAt: new Date() });

      const openCodeResult = await this.openCodeService.executePrompt({
        taskId,
        prompt: task.prompt,
        cwd: repo.path,
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

      // ── Coding -> Testing ──────────────────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.CodingFinished);

      // Run the build pipeline: install, lint, typecheck, build, test
      const buildResult = await this.buildService.runPipeline({
        taskId,
        cwd: repo.path,
        installCommand: repo.installCommand ?? undefined,
        lintCommand: repo.lintCommand ?? undefined,
        typecheckCommand: repo.typecheckCommand ?? undefined,
        buildCommand: repo.buildCommand ?? undefined,
        testCommand: repo.testCommand ?? undefined,
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

      // ── Testing -> WaitingApproval ─────────────────────────────────
      // Generate diff and ask for approval
      const diff = await this.gitService.getChangedFiles(repo.path);
      const diffSummary = this.summarizeDiff(diff);
      await this.engine.fire(taskId, WorkflowEvent.ApprovalRequested);

      if (repo.approvalPolicy === 'auto') {
        // Auto-approve: skip waiting
        await this.approveTask(taskId, chatId);
      } else {
        await this.notify(taskId, chatId, 'info', 'Approval Required', diffSummary, [
          { label: '✅ Approve', action: 'approve', data: { taskId } },
          { label: '❌ Reject', action: 'reject', data: { taskId } },
        ]);
        this.pendingApprovals.set(taskId, { chatId, diffSummary });
      }
    } catch (err) {
      await this.failTask(taskId, (err as Error).message);
    }
  }

  /** Approve a waiting task and proceed to commit + push. */
  async approveTask(taskId: string, _chatId: string): Promise<void> {
    const task = await this.taskService.findById(taskId);
    if (!task) return;
    const repo = await this.repositoryService.findById(task.repositoryId);
    if (!repo) return;

    const chatId = _chatId || task.createdBy;
    this.pendingApprovals.delete(taskId);

    try {
      // ── WaitingApproval -> Committing ───────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.Approved);

      const branchName = `opencode/task-${task.publicId}`;
      await this.gitService.createBranch(repo.path, branchName);
      await this.taskService.transition(taskId, WorkflowState.Committing, { branch: branchName });

      const commitMessage = this.generateCommitMessage(task.prompt, task.publicId);
      const commit = await this.gitService.commit(repo.path, commitMessage);
      await this.taskService.transition(taskId, WorkflowState.Committing, { commitSha: commit.sha });

      await this.notify(taskId, chatId, 'info', 'Committed', `SHA: ${commit.sha.slice(0, 7)}`);

      // ── Committing -> Pushing ───────────────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.CommitFinished);
      await this.gitService.push(repo.path, branchName);
      await this.taskService.transition(taskId, WorkflowState.Pushing);

      // ── Pushing -> Finished ─────────────────────────────────────────
      await this.engine.fire(taskId, WorkflowEvent.PushFinished);
      await this.taskService.transition(taskId, WorkflowState.Finished, { finishedAt: new Date() });

      await this.notify(
        taskId,
        chatId,
        'success',
        'Task Finished',
        `Branch: ${branchName}\nCommit: ${commit.sha.slice(0, 7)}`,
      );

      this.events.emit(AppEvents.TaskFinished, { taskId, publicId: task.publicId });
    } catch (err) {
      await this.failTask(taskId, `Commit/Push failed: ${(err as Error).message}`);
    }
  }

  /** Reject a waiting task. */
  async rejectTask(taskId: string, chatId: string): Promise<void> {
    this.pendingApprovals.delete(taskId);
    await this.engine.fire(taskId, WorkflowEvent.Rejected);
    await this.taskService.transition(taskId, WorkflowState.Failed, {
      errorMessage: 'Rejected by user',
      finishedAt: new Date(),
    });
    await this.notify(taskId, chatId, 'warn', 'Task Rejected', 'Changes were not committed.');
  }

  /** Cancel a running task. */
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

  /** Resume a failed/finished task by re-queuing it. */
  async resumeTask(taskId: string): Promise<void> {
    await this.engine.fire(taskId, WorkflowEvent.Resume);
    await this.taskService.transition(taskId, WorkflowState.Pending);
    // Re-run the pipeline
    await this.runTask(taskId);
  }

  // ── Helpers ────────────────────────────────────────────────────────
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

  private summarizeDiff(diff: { files: string[]; stat: string }): string {
    if (diff.files.length === 0) {
      return 'No changes detected.';
    }
    const fileList = diff.files.map((f) => `  • ${f}`).join('\n');
    return `Changed files (${diff.files.length}):\n${fileList}`;
  }

  private generateCommitMessage(prompt: string, publicId: string): string {
    const shortPrompt = prompt.length > 72 ? prompt.slice(0, 72) + '...' : prompt;
    return `feat(opencode): ${shortPrompt}\n\nGenerated by OpenCode Orchestrator (task: ${publicId})`;
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
