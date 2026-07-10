import { Injectable, Logger } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly bot: Telegraf | null;
  private readonly sessions = new Map<
    string,
    {
      chatId: string;
      messageId: number;
      readOutput: () => string;
      lastFlush: number;
    }
  >();
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly MAX_LENGTH = 4000;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('app.botToken', '');
    this.bot = token ? new Telegraf(token) : null;
  }

  async sendSessionStart(
    chatId: string,
    sessionPublicId: string,
    readOutput: () => string,
  ): Promise<number | null> {
    if (!this.bot) return null;
    try {
      const msg = await this.bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b>\n<code>Starting...</code>`,
        { parse_mode: 'HTML' },
      );
      this.sessions.set(sessionPublicId, {
        chatId,
        messageId: msg.message_id,
        readOutput,
        lastFlush: Date.now(),
      });
      return msg.message_id;
    } catch (err) {
      this.logger.error(`sendSessionStart: ${(err as Error).message}`);
      return null;
    }
  }

  async showSessionOutput(
    chatId: string,
    sessionPublicId: string,
    sessionOutput: string,
    running: boolean,
  ): Promise<void> {
    if (!this.bot) return;
    const display = (sessionOutput || '(no output yet)').slice(-this.MAX_LENGTH);
    const status = running ? '🟢 active' : '🔴 finished';
    try {
      await this.bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b> ${status}\n${display}`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      this.logger.error(`showSessionOutput: ${(err as Error).message}`);
    }
  }

  appendOutput(sessionPublicId: string, _text: string): void {
    const sess = this.sessions.get(sessionPublicId);
    if (!sess || !this.bot) return;

    const existing = this.flushTimers.get(sessionPublicId);
    if (existing) return;

    const timer = setTimeout(() => {
      this.flushTimers.delete(sessionPublicId);
      this.flush(sessionPublicId);
    }, 300);

    this.flushTimers.set(sessionPublicId, timer);
  }

  private flush(sessionPublicId: string): void {
    const sess = this.sessions.get(sessionPublicId);
    if (!sess || !this.bot) return;
    sess.lastFlush = Date.now();

    let raw = sess.readOutput().slice(-this.MAX_LENGTH);
    if (!raw.trim()) return;

    // Strip TUI chrome that xterm buffer still contains (box-drawing, status bars, etc.)
    raw = raw.replace(/[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2800-\u28FF]/g, '');
    raw = raw.replace(/[▣▢■⬝┃│╹╺╻╼╽╾╿]/g, '');
    raw = raw.replace(/^\s*Build[\s·\w]+$/gm, '');
    raw = raw.replace(/^\s*Thought:\s*\d+ms/gm, '');

    const display = this.esc(raw);

    const extra: Record<string, unknown> = { parse_mode: 'HTML' as const };
    extra.reply_markup = Markup.inlineKeyboard([
      [Markup.button.callback('↹ Tab', JSON.stringify({ t: 'key', v: 'tab' })), Markup.button.callback('↵ Enter', JSON.stringify({ t: 'key', v: 'enter' }))],
      [Markup.button.callback('⬆ Up', JSON.stringify({ t: 'key', v: 'up' })), Markup.button.callback('⬇ Down', JSON.stringify({ t: 'key', v: 'down' }))],
      [Markup.button.callback('✕ Ctrl+C', JSON.stringify({ t: 'key', v: 'ctrl+c' }))],
    ]).reply_markup;

    void this.bot.telegram
      .editMessageText(
        sess.chatId,
        sess.messageId,
        undefined,
        display,
        extra as never,
      )
      .catch((err: unknown) => {
        this.logger.debug(`Edit failed: ${(err as Error).message}`);
      });
  }

  async sendSessionEnd(
    sessionPublicId: string,
    exitCode: number | null,
    durationMs: number,
  ): Promise<void> {
    const sess = this.sessions.get(sessionPublicId);
    if (!sess || !this.bot) return;

    const timer = this.flushTimers.get(sessionPublicId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionPublicId);
      this.flush(sessionPublicId);
    }

    const status =
      exitCode === null
        ? 'cancelled'
        : exitCode === 0
          ? 'finished'
          : `failed (exit ${exitCode})`;

    const display = this.esc(sess.readOutput().slice(-this.MAX_LENGTH));

    try {
      await this.bot.telegram.editMessageText(
        sess.chatId,
        sess.messageId,
        undefined,
        `<b>Session ${this.esc(sessionPublicId)}</b> ${status} (${Math.round(durationMs / 1000)}s)\n${display}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
      );
    } catch (err) {
      this.logger.debug(`Session end: ${(err as Error).message}`);
    }

    this.sessions.delete(sessionPublicId);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch { /* ignore */ }
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
