import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';

/**
 * Manages the Telegraf bot instance and the webhook/polling lifecycle.
 * Provides access to the bot for sending messages and handling updates.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  readonly bot: Telegraf;
  private started = false;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('app.botToken', '');
    if (!token) {
      throw new Error('BOT_TOKEN is required');
    }
    this.bot = new Telegraf(token);

    this.bot.catch((err) => {
      this.logger.error(`Telegram bot error: ${(err as Error).message}`);
    });
  }

  /**
   * Start the bot. Returns quickly — does NOT await the long-running
   * polling/webhook loop.
   *
   * In webhook mode, sets the webhook URL via Telegram API.
   * In polling mode, calls `bot.launch()` which starts an internal polling
   * loop that runs indefinitely. The promise from `launch()` never resolves
   * (by design), so we fire it in the background.
   */
  async start(): Promise<void> {
    if (this.started) return;

    this.logger.log('Telegram bot starting...');

    const webhookDomain = this.config.get<string>('app.webhookDomain', '');

    if (webhookDomain) {
      await this.startWebhook(webhookDomain);
    } else {
      this.startPolling();
    }
  }

  private async startWebhook(domain: string): Promise<void> {
    try {
      const hookPath = '/api/telegram/webhook';
      await this.bot.telegram.setWebhook(`${domain}${hookPath}`);
      this.logger.log(`Webhook set to ${domain}${hookPath}`);
      this.started = true;
    } catch (err) {
      this.logger.error(`Failed to set webhook: ${(err as Error).message}`);
    }
  }

  /**
   * Start long-polling in the background. `bot.launch()` runs a
   * `getUpdates` loop that never resolves — it must NOT be awaited.
   */
  private startPolling(): void {
    this.logger.log('Starting bot in polling mode (background)...');
    void this.bot
      .launch()
      .then(() => {
        this.started = true;
        this.logger.log('Telegram bot started (long polling)');
      })
      .catch((err: unknown) => {
        this.logger.error(`Failed to launch Telegram bot: ${(err as Error).message}`);
      });
  }

  /** Stop the bot. */
  stop(): void {
    if (!this.started) return;
    try {
      this.bot.stop('SIGTERM');
    } catch {
      // ignore
    }
    this.started = false;
  }

  /** Handle a raw update from a webhook POST. */
  async handleUpdate(update: Update): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  /** Get the bot info. */
  async getBotInfo() {
    return this.bot.telegram.getMe();
  }

  /** Register bot commands with Telegram (for autocomplete). */
  async setCommands(): Promise<void> {
    this.logger.log('Setting bot commands...');
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'new', description: 'Start a new task' },
        { command: 'repos', description: 'List repositories' },
        { command: 'status', description: 'Task status' },
        { command: 'tasks', description: 'List tasks' },
        { command: 'cancel', description: 'Cancel a task' },
        { command: 'resume', description: 'Resume a task' },
        { command: 'logs', description: 'Get task logs' },
        { command: 'diff', description: 'Get git diff' },
        { command: 'approve', description: 'Approve a task' },
        { command: 'reject', description: 'Reject a task' },
        { command: 'help', description: 'Show help' },
      ]);
      this.logger.log('Bot commands set successfully');
    } catch (err) {
      this.logger.warn(`Failed to set bot commands: ${(err as Error).message}`);
    }
  }
}
