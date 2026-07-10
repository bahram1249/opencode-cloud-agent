import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TelegramAuthGuard } from 'src/common/guards/telegram-auth.guard';
import { NotificationService } from 'src/modules/notification/notification.service';
import type { Update } from 'telegraf/types';
import type { Context } from 'telegraf';
import { TaskService } from 'src/modules/task/task.service';
import { WorkflowOrchestrator } from 'src/modules/workflow/workflow-orchestrator.service';

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
      .then(() => this.botService.start())
      .then(() => { this.logger.log('Telegram service initialised'); })
      .catch((err: unknown) => {
        this.logger.error('Telegram bot startup failed');
        this.logger.error((err as Error).message);
      });
  }

  onModuleDestroy(): void {
    this.botService.stop();
  }

  async handleUpdate(update: Update): Promise<void> {
    await this.botService.handleUpdate(update);
  }

  private registerCommands(): void {
    const bot = this.botService.bot;

    // ── Session ────────────────────────────────────────────────────
    bot.command('session', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleStartSessionCmd(
        this.toContext(ctx),
        this.getArgs(ctx),
      );
    });

    bot.command('send', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleSendCmd(this.toContext(ctx), this.getArgs(ctx));
    });

    bot.command('cancel', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleCancelCmd(this.toContext(ctx), this.getArgs(ctx));
    });

    // ── Workspace & Projects ───────────────────────────────────────
    bot.command('workspace', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleWorkspaceCmd(
        this.toContext(ctx),
        this.getArgs(ctx),
      );
    });

    bot.command('project', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const args = this.getArgs(ctx);
      if (args.length === 0) {
        // Show active workspace projects
        await this.handler.handleWorkspaceCmd(this.toContext(ctx), ['show']);
      } else {
        await this.handler.handleWorkspaceCmd(this.toContext(ctx), args);
      }
    });

    // ── Sessions ────────────────────────────────────────────────────
    bot.command('sessions', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleSessionsCmd(this.toContext(ctx));
    });

    // ── Git ────────────────────────────────────────────────────────
    bot.command('git', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleGitCmd(this.toContext(ctx), this.getArgs(ctx));
    });

    // ── OpenCode control ───────────────────────────────────────────
    bot.command('opencode', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleSendCmd(this.toContext(ctx), this.getArgs(ctx));
    });

    bot.command('model', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleSendCmd(
        this.toContext(ctx),
        ['/model', ...this.getArgs(ctx)],
      );
    });

    bot.command('skill', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleSendCmd(
        this.toContext(ctx),
        ['/skill', ...this.getArgs(ctx)],
      );
    });

    // ── Terminal interaction keys ──────────────────────────────────
    bot.command('tab', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleKeyCmd(this.toContext(ctx), 'tab');
    });
    bot.command('enter', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleKeyCmd(this.toContext(ctx), 'enter');
    });
    bot.command('up', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleKeyCmd(this.toContext(ctx), 'up');
    });
    bot.command('down', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleKeyCmd(this.toContext(ctx), 'down');
    });
    bot.command('ctrl_c', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleKeyCmd(this.toContext(ctx), 'ctrl+c');
    });

    // ── Legacy commands ────────────────────────────────────────────
    bot.command('new', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleNew(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('status', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleStatus(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('tasks', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleTasks(this.toContext(ctx));
    });
    bot.command('repos', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleRepos(this.toContext(ctx));
    });
    bot.command('resume', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleResume(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('logs', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleLogs(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('diff', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleDiff(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('approve', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleApprove(this.toContext(ctx), this.getArgs(ctx));
    });
    bot.command('reject', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleReject(this.toContext(ctx), this.getArgs(ctx));
    });

    // ── Help ───────────────────────────────────────────────────────
    bot.command('help', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.handler.handleHelp(this.toContext(ctx));
    });

    // ── Plain text → session ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    bot.on('text', async (ctx: Context) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const msg = ctx.message;
      if (!msg || !('text' in msg)) return;
      const text = msg.text;
      if (text.startsWith('/')) return;

      const chatId = String(ctx.chat?.id ?? 0);
      const userId = String(ctx.from?.id ?? 0);

      await this.handler.handleTextInput(chatId, userId, text);
    });
  }

  private registerCallbackQueries(): void {
    const bot = this.botService.bot;

    bot.action(/.*/, async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;

      const data =
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? ctx.callbackQuery.data
          : '';

      const chatId = String(ctx.chat?.id ?? 0);
      const userId = String(ctx.from?.id ?? 0);

      // Route all structured callbacks through the handler
      await this.handler.handleCallback(chatId, userId, data);
      await ctx.answerCbQuery().catch(() => {});
    });
  }

  private isAuthorized(userId: number | undefined): boolean {
    if (!userId) return false;
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
