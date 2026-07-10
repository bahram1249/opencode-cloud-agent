import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';

/**
 * Streams session output to a SINGLE editable Telegram message.
 * Each session gets exactly one message that is continuously updated
 * with the latest ~3500 characters of output.
 *
 * On session end, the message is updated with final status.
 */
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly bot: Telegraf | null;
  private readonly sessions = new Map<
    string,
    {
      chatId: string;
      messageId: number;
      buffer: string;
      lastFlush: number;
    }
  >();
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly MAX_LENGTH = 3500;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('app.botToken', '');
    this.bot = token ? new Telegraf(token) : null;
  }

  /**
   * Send the initial session message. Returns the message id.
   */
  async sendSessionStart(
    chatId: string,
    sessionPublicId: string,
  ): Promise<number | null> {
    if (!this.bot) return null;
    try {
      const msg = await this.bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b>\n<pre>Starting...</pre>`,
        { parse_mode: 'HTML' },
      );
      this.sessions.set(sessionPublicId, {
        chatId,
        messageId: msg.message_id,
        buffer: '',
        lastFlush: Date.now(),
      });
      return msg.message_id;
    } catch (err) {
      this.logger.error(`sendSessionStart: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Show accumulated output from a session (for session switching / viewing).
   * Sends a fresh message with the buffer content.
   */
  async showSessionOutput(
    chatId: string,
    sessionPublicId: string,
    sessionOutput: string,
    running: boolean,
  ): Promise<void> {
    if (!this.bot) return;
    const display = sessionOutput.length > this.MAX_LENGTH
      ? '...' + sessionOutput.slice(-this.MAX_LENGTH)
      : sessionOutput || '(no output yet)';
    const status = running ? '🟢 active' : '🔴 finished';
    try {
      await this.bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b> ${status}\n<pre>${this.esc(display)}</pre>`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      this.logger.error(`showSessionOutput: ${(err as Error).message}`);
    }
  }

  /**
   * Append output to the session buffer and debounce-flush to the single message.
   */
  appendOutput(sessionPublicId: string, text: string): void {
    const sess = this.sessions.get(sessionPublicId);
    if (!sess || !this.bot || !text.trim()) return;

    sess.buffer += text;

    // Debounce flush: accumulate for 300ms then update
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

    const display = sess.buffer.length > this.MAX_LENGTH
      ? '...' + sess.buffer.slice(-this.MAX_LENGTH)
      : sess.buffer;

    if (!display.trim()) return;

    void this.bot.telegram
      .editMessageText(
        sess.chatId,
        sess.messageId,
        undefined,
        `<pre>${this.esc(display)}</pre>`,
        { parse_mode: 'HTML' },
      )
      .catch((err: unknown) => {
        this.logger.debug(`Edit failed: ${(err as Error).message}`);
      });

    // Detect questions/prompts — if output contains ? or looks like a choice
    const lastLine = display.split('\n').filter(Boolean).pop() || '';
    const hasQuestion = lastLine.includes('?') || /\[\d+\]/.test(lastLine) || lastLine.endsWith(':');
    if (hasQuestion) {
      void this.bot.telegram
        .sendMessage(
          sess.chatId,
          '💬 OpenCode is waiting for input. Type your answer or use:\n' +
            '/send &lt;answer&gt; — type your response\n' +
            '/tab — autocomplete / next option\n' +
            '/up / /down — navigate options\n' +
            '/enter — confirm',
          { parse_mode: 'HTML' },
        )
        .catch(() => {});
    }
  }

  /**
   * Mark session as ended and do final flush.
   */
  async sendSessionEnd(
    sessionPublicId: string,
    exitCode: number | null,
    durationMs: number,
  ): Promise<void> {
    const sess = this.sessions.get(sessionPublicId);
    if (!sess || !this.bot) return;

    // Flush any pending output first
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

    const display = sess.buffer.length > this.MAX_LENGTH
      ? '...' + sess.buffer.slice(-this.MAX_LENGTH)
      : sess.buffer;

    try {
      await this.bot.telegram.editMessageText(
        sess.chatId,
        sess.messageId,
        undefined,
        `<b>Session ${this.esc(sessionPublicId)}</b> ${status} (${Math.round(durationMs / 1000)}s)\n<pre>${this.esc(display)}</pre>`,
        { parse_mode: 'HTML' },
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
