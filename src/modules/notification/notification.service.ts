import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import type { NotificationPayload, NotificationButton } from 'src/common/types';
import { Markup } from 'telegraf';
import { html } from 'telegram-format';

/**
 * Sends notifications to Telegram chats. Wraps the Telegraf bot instance and
 * formats messages with HTML markdown. Inline keyboard buttons are supported
 * for approve/reject/cancel actions.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly bot: Telegraf | null;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('app.botToken', '');
    this.bot = token ? new Telegraf(token) : null;
  }

  /** Send a formatted notification to a Telegram chat. */
  async send(payload: NotificationPayload): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Telegram bot not configured — notification logged only');
      this.logger.log(`[${payload.level}] ${payload.title}: ${payload.body ?? ''}`);
      return;
    }

    const emoji = this.levelEmoji(payload.level);
    const text = this.formatMessage(payload, emoji);
    const keyboard = payload.buttons ? this.buildKeyboard(payload.buttons) : undefined;

    try {
      await this.bot.telegram.sendMessage(payload.chatId, text, {
        parse_mode: 'HTML',
        ...(keyboard ? { reply_markup: keyboard.reply_markup } : {}),
      });
    } catch (err) {
      this.logger.error(`Failed to send notification to ${payload.chatId}: ${(err as Error).message}`);
    }
  }

  /** Send a raw text message (no formatting). */
  async sendRaw(chatId: string, text: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.telegram.sendMessage(chatId, text);
    } catch (err) {
      this.logger.error(`Failed to send raw message: ${(err as Error).message}`);
    }
  }

  /** Send a file (e.g. log output) as a document. */
  async sendDocument(chatId: string, filename: string, content: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.telegram.sendDocument(
        chatId,
        { source: Buffer.from(content, 'utf-8'), filename },
        { caption: filename },
      );
    } catch (err) {
      this.logger.error(`Failed to send document: ${(err as Error).message}`);
    }
  }

  private formatMessage(payload: NotificationPayload, emoji: string): string {
    const lines: string[] = [];
    lines.push(`${emoji} <b>${html.escape(payload.title)}</b>`);
    if (payload.body) {
      const truncated = payload.body.length > 3000 ? payload.body.slice(0, 3000) + '...' : payload.body;
      lines.push(html.escape(truncated));
    }
    lines.push(`<i>Task: ${payload.taskId}</i>`);
    return lines.join('\n');
  }

  private buildKeyboard(buttons: NotificationButton[]) {
    const rows = buttons.map((btn) =>
      Markup.button.callback(btn.label, JSON.stringify({ a: btn.action, ...btn.data })),
    );
    return Markup.inlineKeyboard(rows, { columns: 2 });
  }

  private levelEmoji(level: NotificationPayload['level']): string {
    switch (level) {
      case 'success':
        return '✅';
      case 'warn':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  }
}
