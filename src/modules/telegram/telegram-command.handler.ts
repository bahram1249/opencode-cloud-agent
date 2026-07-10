import { Injectable, Logger } from '@nestjs/common';
import type { TelegramContext } from 'src/modules/telegram/telegram.types';
import { TaskService } from 'src/modules/task/task.service';
import { WorkflowOrchestrator } from 'src/modules/workflow/workflow-orchestrator.service';
import { RepositoryService } from 'src/modules/repository/repository.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { ConfigService } from '@nestjs/config';
import { WorkflowState } from 'src/common/constants/workflow.constants';
import { BOT_COMMANDS } from './commands/commands.constants';

/**
 * Handles all Telegram bot commands. Each method receives the Telegram
 * context and parsed arguments. The service delegates to domain services
 * (Task, Repository, Workflow) and sends responses via the NotificationService.
 */
@Injectable()
export class TelegramCommandHandler {
  private readonly logger = new Logger(TelegramCommandHandler.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly repositoryService: RepositoryService,
    private readonly workflowOrchestrator: WorkflowOrchestrator,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService,
  ) {}

  /** /new <prompt> — Create and start a new task. */
  async handleNew(ctx: TelegramContext, args: string[]): Promise<void> {
    const prompt = args.join(' ').trim();
    if (!prompt) {
      await this.reply(ctx, 'Usage: /new <prompt>\nExample: /new Fix issue #52');
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      await this.reply(ctx, 'Error: Unable to identify your Telegram user.');
      return;
    }

    const defaultRepo = this.config.get<string>('app.defaultRepository', 'default');
    const { publicId } = await this.taskService.createTask({
      prompt,
      repositorySlug: defaultRepo,
      telegramUserId: userId,
    });

    await this.reply(ctx, `✅ Task created: \`${publicId}\`\n\nPrompt: ${prompt}`);
    this.logger.log(`Task ${publicId} created by user ${userId}`);
  }

  /** /repos — List all registered repositories. */
  async handleRepos(ctx: TelegramContext): Promise<void> {
    const repos = await this.repositoryService.findAll({ enabled: true });
    if (repos.length === 0) {
      await this.reply(ctx, 'No repositories registered. Use the API to add one.');
      return;
    }
    const list = repos
      .map((r) => `📦 *${r.slug}* (${r.name})\n   Branch: ${r.branch}\n   Path: ${r.path}`)
      .join('\n\n');
    await this.reply(ctx, `Repositories:\n\n${list}`);
  }

  /** /status <taskId> — Show status of a task. */
  async handleStatus(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /status <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    const status = `📋 *Task ${task.publicId}*
Status: \`${task.status}\`
Repository: ${task.repository?.slug ?? 'N/A'}
Branch: ${task.branch ?? 'N/A'}
Commit: ${task.commitSha?.slice(0, 7) ?? 'N/A'}
Created: ${task.createdAt.toISOString()}
${task.errorMessage ? `Error: ${task.errorMessage}` : ''}`;
    await this.reply(ctx, status);
  }

  /** /tasks — List recent tasks. */
  async handleTasks(ctx: TelegramContext): Promise<void> {
    const { items } = await this.taskService.listTasks({ page: 1, pageSize: 10 });
    if (items.length === 0) {
      await this.reply(ctx, 'No tasks found.');
      return;
    }
    const list = items
      .map(
        (t) =>
          `• \`${t.publicId}\` [${t.status}] ${(t.prompt ?? '').slice(0, 60)}...`,
      )
      .join('\n');
    await this.reply(ctx, `Recent tasks:\n\n${list}`);
  }

  /** /cancel <taskId> — Cancel a running task. */
  async handleCancel(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /cancel <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    await this.workflowOrchestrator.cancelTask(task.id);
    await this.reply(ctx, `🛑 Task \`${publicId}\` cancelled.`);
  }

  /** /resume <taskId> — Resume a failed task. */
  async handleResume(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /resume <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    await this.reply(ctx, `🔄 Resuming task \`${publicId}\`...`);
    await this.workflowOrchestrator.resumeTask(task.id);
  }

  /** /logs <taskId> — Get logs for a task. */
  async handleLogs(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /logs <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    const logs = await this.taskService.getLogs(task.id, 50);
    if (logs.length === 0) {
      await this.reply(ctx, 'No logs found.');
      return;
    }
    const text = logs
      .reverse()
      .map((l) => `[${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');

    if (text.length > 4000) {
      await this.notificationService.sendDocument(
        String(ctx.chat?.id ?? 0),
        `${publicId}-logs.txt`,
        text,
      );
    } else {
      await this.reply(ctx, `Logs for \`${publicId}\`:\n\n${text}`);
    }
  }

  /** /diff <taskId> — Get git diff for a task. */
  async handleDiff(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /diff <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    const executions = await this.taskService.getExecutions(task.id);
    const gitExec = executions.find((e) => e.stage === 'git');
    if (!gitExec) {
      await this.reply(ctx, 'No diff available for this task.');
      return;
    }
    const diff = gitExec.stdout || gitExec.stderr;
    if (diff.length > 4000) {
      await this.notificationService.sendDocument(
        String(ctx.chat?.id ?? 0),
        `${publicId}-diff.patch`,
        diff,
      );
    } else {
      await this.reply(ctx, `Diff for \`${publicId}\`:\n\n${diff}`);
    }
  }

  /** /approve <taskId> — Approve a waiting task. */
  async handleApprove(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /approve <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    if (task.status !== (WorkflowState.WaitingApproval as string)) {
      await this.reply(ctx, `Task \`${publicId}\` is not waiting for approval (status: ${task.status}).`);
      return;
    }
    await this.reply(ctx, `✅ Approving task \`${publicId}\`...`);
    await this.workflowOrchestrator.approveTask(task.id, String(ctx.from?.id ?? 0));
  }

  /** /reject <taskId> — Reject a waiting task. */
  async handleReject(ctx: TelegramContext, args: string[]): Promise<void> {
    const publicId = args[0];
    if (!publicId) {
      await this.reply(ctx, 'Usage: /reject <taskId>');
      return;
    }
    const task = await this.taskService.findByPublicId(publicId);
    if (!task) {
      await this.reply(ctx, `Task \`${publicId}\` not found.`);
      return;
    }
    if (task.status !== (WorkflowState.WaitingApproval as string)) {
      await this.reply(ctx, `Task \`${publicId}\` is not waiting for approval.`);
      return;
    }
    await this.reply(ctx, `❌ Rejecting task \`${publicId}\`...`);
    await this.workflowOrchestrator.rejectTask(task.id, String(ctx.from?.id ?? 0));
  }

  /** /help — Show help. */
  async handleHelp(ctx: TelegramContext): Promise<void> {
    const lines = BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`);
    await this.reply(ctx, `OpenCode Orchestrator Bot\n\nCommands:\n${lines.join('\n')}`);
  }

  private async reply(ctx: TelegramContext, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await this.notificationService.sendRaw(String(chatId), text);
  }
}
