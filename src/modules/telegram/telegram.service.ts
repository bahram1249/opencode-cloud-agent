import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TelegramAuthGuard } from 'src/common/guards/telegram-auth.guard';
import { NotificationService } from 'src/modules/notification/notification.service';
import type { Update } from 'telegraf/types';
import type { Context } from 'telegraf';
import { CALLBACK_ACTIONS } from './commands/commands.constants';
import { TaskService } from 'src/modules/task/task.service';
import { WorkflowOrchestrator } from 'src/modules/workflow/workflow-orchestrator.service';

/**
 * Registers all bot command handlers and callback query (inline keyboard)
 * handlers on the Telegraf bot. Runs on module init, stops on destroy.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly botService: TelegramBotService,
    private readonly handler: TelegramCommandHandler,
    private readonly guard: TelegramAuthGuard,
    private readonly notificationService: NotificationService,
    private readonly taskService: TaskService,
    private readonly workflowOrchestrator: WorkflowOrchestrator,
  ) {}

  onModuleInit(): void {
    this.registerCommands();
    this.registerCallbackQueries();
    this.initBot();
  }

  private initBot(): void {
    this.logger.log('Initialising Telegram bot...');
    void this.botService
      .setCommands()
      .then(() => {
        return this.botService.start();
      })
      .then(() => {
        this.logger.log('Telegram service initialised');
      })
      .catch((err: unknown) => {
        this.logger.error('Telegram bot startup failed');
        this.logger.error((err as Error).message);
      });
  }

  onModuleDestroy(): void {
    this.botService.stop();
  }

  /** Handle a raw update (from webhook controller). */
  async handleUpdate(update: Update): Promise<void> {
    await this.botService.handleUpdate(update);
  }

  private registerCommands(): void {
    const bot = this.botService.bot;

    bot.command('new', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(/\s+/).slice(1)
        : [];
      await this.handler.handleNew(this.toContext(ctx), args);
    });

    bot.command('repos', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleRepos(this.toContext(ctx));
    });

    bot.command('status', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleStatus(this.toContext(ctx), args);
    });

    bot.command('tasks', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleTasks(this.toContext(ctx));
    });

    bot.command('cancel', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleCancel(this.toContext(ctx), args);
    });

    bot.command('resume', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleResume(this.toContext(ctx), args);
    });

    bot.command('logs', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleLogs(this.toContext(ctx), args);
    });

    bot.command('diff', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleDiff(this.toContext(ctx), args);
    });

    bot.command('approve', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleApprove(this.toContext(ctx), args);
    });

    bot.command('reject', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      await this.handler.handleReject(this.toContext(ctx), args);
    });

    bot.command('help', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleHelp(this.toContext(ctx));
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    bot.on('text', async (ctx: Context) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const msg = ctx.message;
      if (!msg || !('text' in msg)) return;
      const text = msg.text;
      if (text.startsWith('/')) return;
      await this.handler.handleNew(this.toContext(ctx), text.split(/\s+/));
    });
  }

  private registerCallbackQueries(): void {
    const bot = this.botService.bot;

    bot.action(/.*/, async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;

      const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(data) as Record<string, string>;
      } catch {
        this.logger.warn(`Invalid callback data: ${data}`);
        return;
      }

      const action = parsed.a ?? '';
      const taskId = parsed['taskId'] ?? '';

      switch (action) {
        case CALLBACK_ACTIONS.APPROVE:
          await ctx.answerCbQuery('Approved');
          await this.workflowOrchestrator.approveTask(taskId, String(ctx.from?.id ?? 0));
          break;
        case CALLBACK_ACTIONS.REJECT:
          await ctx.answerCbQuery('Rejected');
          await this.workflowOrchestrator.rejectTask(taskId, String(ctx.from?.id ?? 0));
          break;
        case CALLBACK_ACTIONS.CANCEL:
          await ctx.answerCbQuery('Cancelling...');
          await this.workflowOrchestrator.cancelTask(taskId);
          break;
        default:
          await ctx.answerCbQuery('Unknown action');
      }
    });
  }

  private isAuthorized(userId: number | undefined): boolean {
    if (!userId) return false;
    // Delegate to guard logic — check authorized users set from config
    return this.guard.canActivate({
      switchToRpc: () => ({ getContext: () => ({ from: { id: userId } }) }),
    } as never);
  }

  private getArgs(ctx: Context): string[] {
    if (ctx.message && 'text' in ctx.message) {
      return ctx.message.text.split(/\s+/).slice(1);
    }
    return [];
  }

  private toContext(ctx: Context) {
    return {
      from: ctx.from,
      chat: ctx.chat,
      update: ctx.update,
      updateId: ctx.update.update_id,
    };
  }
}
