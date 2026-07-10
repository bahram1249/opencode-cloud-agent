import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';

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

  stop(): void {
    if (!this.started) return;
    try {
      this.bot.stop('SIGTERM');
    } catch {
      // ignore
    }
    this.started = false;
  }

  async handleUpdate(update: Update): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  async setCommands(): Promise<void> {
    this.logger.log('Setting bot commands...');
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'session', description: 'Start interactive session — /session <prompt>' },
        { command: 'send', description: 'Send text to active session — /send <text>' },
        { command: 'sessions', description: 'List / switch sessions — /sessions' },
        { command: 'cancel', description: 'Cancel active session — /cancel' },
        { command: 'tab', description: 'Send Tab key (completion) — /tab' },
        { command: 'enter', description: 'Send Enter (confirm) — /enter' },
        { command: 'up', description: 'Arrow Up — /up' },
        { command: 'down', description: 'Arrow Down — /down' },
        { command: 'ctrl_c', description: 'Interrupt (Ctrl+C) — /ctrl_c' },
        { command: 'workspace', description: 'Manage workspaces — /workspace <action>' },
        { command: 'project', description: 'Manage git projects — /project <action>' },
        { command: 'git', description: 'Git operations — /git <subcommand>' },
        { command: 'opencode', description: 'Send raw OpenCode command — /opencode <args>' },
        { command: 'model', description: 'Switch model — /model <name>' },
        { command: 'skill', description: 'Load skill — /skill <name>' },
        { command: 'help', description: 'Show help' },
      ]);
      this.logger.log('Bot commands set successfully');
    } catch (err) {
      this.logger.warn(`Failed to set bot commands: ${(err as Error).message}`);
    }
  }
}
