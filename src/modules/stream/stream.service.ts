import { Injectable, Logger } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'src/config/app.config';
import { cb } from '../telegram/utils/telegram-callback.utils';
import { generateAuthToken } from 'src/common/utils/auth-token';

type StreamEntryStatus = 'live' | 'frozen' | 'finished';

interface StreamEntry {
  chatId: string;
  messageId: number;
  readOutput: () => string;
  lastFlush: number;
  status: StreamEntryStatus;
  createdBy?: string;
}

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly bot: Telegraf | null;
  private readonly sessions = new Map<string, Map<string, StreamEntry>>();
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly MAX_LENGTH = 4000;
  private readonly MIN_ENTRY_INTERVAL_MS = 500;
  private streamIdCounter = 0;

  private readonly miniAppUrl: string;
  private readonly botToken: string;

  constructor(config: ConfigService) {
    const appConfig = config.get<AppConfig>('app');
    this.botToken = appConfig?.botToken ?? '';
    this.bot = this.botToken ? new Telegraf(this.botToken) : null;
    this.miniAppUrl = appConfig?.miniAppUrl ?? '';
  }

  private generateStreamId(): string {
    return `v-${++this.streamIdCounter}`;
  }

  private miniAppUrlWithToken(publicId: string): string | null {
    if (!this.miniAppUrl || !this.botToken) return null;
    const entries = this.sessions.get(publicId);
    if (!entries) return `${this.miniAppUrl}?session=${publicId}`;
    const userId = [...entries.values()].find((e) => e.createdBy)?.createdBy;
    if (!userId) return `${this.miniAppUrl}?session=${publicId}`;
    const token = generateAuthToken(this.botToken, userId);
    return `${this.miniAppUrl}?session=${publicId}&token=${token}`;
  }

  private liveKeyboard(streamId: string, publicId: string) {
    const rows: Array<ReturnType<typeof Markup.button.callback | typeof Markup.button.webApp>[]> = [
      [Markup.button.callback('↹ Tab', cb('key', 'tab')), Markup.button.callback('↵ Enter', cb('key', 'enter'))],
      [Markup.button.callback('⬆ Up', cb('key', 'up')), Markup.button.callback('⬇ Down', cb('key', 'down'))],
      [Markup.button.callback('🔄 Refresh', cb('sess:refresh', `${publicId}:${streamId}`)), Markup.button.callback('✕ Ctrl+C', cb('key', 'ctrl+c'))],
    ];
    const miniAppUrl = this.miniAppUrlWithToken(publicId);
    if (miniAppUrl) {
      rows.push([Markup.button.webApp('🚀 Open in Mini App', miniAppUrl)]);
    }
    return Markup.inlineKeyboard(rows).reply_markup;
  }

  private finishedKeyboard(streamId: string, publicId: string) {
    const rows: Array<ReturnType<typeof Markup.button.callback | typeof Markup.button.webApp>[]> = [
      [Markup.button.callback('🔄 Refresh', cb('sess:refresh', `${publicId}:${streamId}`))],
    ];
    const miniAppUrl = this.miniAppUrlWithToken(publicId);
    if (miniAppUrl) {
      rows.push([Markup.button.webApp('🚀 Open in Mini App', miniAppUrl)]);
    }
    return Markup.inlineKeyboard(rows).reply_markup;
  }

  private formatOutput(raw: string): string {
    if (!raw.trim()) return '';
    return this.esc(
      raw
        .replace(/[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2800-\u28FF]/g, '')
        .replace(/[▣▢■⬝┃│╹╺╻╼╽╾╿]/g, '')
        .replace(/^\s*Build[\s·\w]+$/gm, '')
        .replace(/^\s*Thought:\s*\d+ms/gm, ''),
    );
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendSessionStart(
    chatId: string,
    sessionPublicId: string,
    readOutput: () => string,
    createdBy?: string,
  ): Promise<{ messageId: number | null; streamId: string }> {
    if (!this.bot) return { messageId: null, streamId: '' };

    const streamId = this.generateStreamId();

    try {
      let entryMap = this.sessions.get(sessionPublicId);
      if (!entryMap) {
        entryMap = new Map();
        this.sessions.set(sessionPublicId, entryMap);
      }

      entryMap.set(streamId, {
        chatId,
        messageId: 0,
        readOutput,
        lastFlush: Date.now(),
        status: 'live',
        createdBy,
      });

      const msg = await this.bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b>\n<code>Starting...</code>`,
        { parse_mode: 'HTML', reply_markup: this.liveKeyboard(streamId, sessionPublicId) },
      );

      const entry = entryMap.get(streamId);
      if (entry) {
        entryMap.set(streamId, { ...entry, messageId: msg.message_id });
      }

      return { messageId: msg.message_id, streamId };
    } catch (err) {
      this.logger.error(`sendSessionStart: ${(err as Error).message}`);
      return { messageId: null, streamId };
    }
  }

  async createStreamView(
    chatId: string,
    sessionPublicId: string,
    readOutput: () => string,
  ): Promise<{ messageId: number | null; streamId: string }> {
    const bot = this.bot;
    if (!bot) return { messageId: null, streamId: '' };

    const streamId = this.generateStreamId();

    let entryMap = this.sessions.get(sessionPublicId);
    if (!entryMap) {
      entryMap = new Map();
      this.sessions.set(sessionPublicId, entryMap);
    }

    const freezeEdits: Promise<void>[] = [];
    for (const [sid, entry] of entryMap) {
      if (entry.status !== 'live') continue;
      entry.status = 'frozen';
      freezeEdits.push(
        bot.telegram
          .editMessageText(
            entry.chatId,
            entry.messageId,
            undefined,
            this.formatOutput(entry.readOutput().slice(-this.MAX_LENGTH)),
            { parse_mode: 'HTML', reply_markup: this.finishedKeyboard(sid, sessionPublicId) } as never,
          )
          .then(() => {})
          .catch(() => {}),
      );
    }
    if (freezeEdits.length > 0) {
      await Promise.allSettled(freezeEdits);
    }

    try {
      const msg = await bot.telegram.sendMessage(
        chatId,
        `<b>Session ${this.esc(sessionPublicId)}</b> (continued)\n<code>Starting...</code>`,
        { parse_mode: 'HTML', reply_markup: this.liveKeyboard(streamId, sessionPublicId) },
      );

      entryMap.set(streamId, {
        chatId,
        messageId: msg.message_id,
        readOutput,
        lastFlush: 0,
        status: 'live',
      });

      this.flush(sessionPublicId);

      return { messageId: msg.message_id, streamId };
    } catch (err) {
      this.logger.error(`createStreamView: ${(err as Error).message}`);
      return { messageId: null, streamId };
    }
  }

  async showSessionOutput(
    chatId: string,
    sessionPublicId: string,
    sessionOutput: string,
    running: boolean,
  ): Promise<void> {
    if (!this.bot) return;
    const display = this.formatOutput((sessionOutput || '(no output yet)').slice(-this.MAX_LENGTH)) || '(no output)';
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
    const entries = this.sessions.get(sessionPublicId);
    if (!entries || entries.size === 0 || !this.bot) return;

    const existing = this.flushTimers.get(sessionPublicId);
    if (existing) return;

    const timer = setTimeout(() => {
      this.flushTimers.delete(sessionPublicId);
      this.flush(sessionPublicId);
    }, 300);

    this.flushTimers.set(sessionPublicId, timer);
  }

  private flush(sessionPublicId: string): void {
    const entries = this.sessions.get(sessionPublicId);
    if (!entries || !this.bot) return;

    const now = Date.now();

    for (const [streamId, entry] of entries) {
      if (entry.status !== 'live') continue;
      if (entry.lastFlush + this.MIN_ENTRY_INTERVAL_MS > now) continue;

      entry.lastFlush = now;

      const display = this.formatOutput(entry.readOutput().slice(-this.MAX_LENGTH));
      if (!display) continue;

      void this.bot.telegram
        .editMessageText(
          entry.chatId,
          entry.messageId,
          undefined,
          display,
          { parse_mode: 'HTML', reply_markup: this.liveKeyboard(streamId, sessionPublicId) } as never,
        )
        .catch(() => {
          entries.delete(streamId);
        });
    }

    if (entries.size === 0) {
      this.sessions.delete(sessionPublicId);
    }
  }

  async refreshEntry(sessionPublicId: string, streamId: string): Promise<void> {
    const entries = this.sessions.get(sessionPublicId);
    if (!entries || !this.bot) return;

    const entry = entries.get(streamId);
    if (!entry) return;

    const display = this.formatOutput(entry.readOutput().slice(-this.MAX_LENGTH));
    if (!display) return;

    const keyboard = entry.status === 'live'
      ? this.liveKeyboard(streamId, sessionPublicId)
      : this.finishedKeyboard(streamId, sessionPublicId);

    try {
      await this.bot.telegram.editMessageText(
        entry.chatId,
        entry.messageId,
        undefined,
        display,
        { parse_mode: 'HTML', reply_markup: keyboard } as never,
      );
    } catch {
      entries.delete(streamId);
      if (entries.size === 0) {
        this.sessions.delete(sessionPublicId);
      }
    }
  }

  async sendSessionEnd(
    sessionPublicId: string,
    exitCode: number | null,
    durationMs: number,
  ): Promise<void> {
    const entries = this.sessions.get(sessionPublicId);
    const bot = this.bot;
    if (!entries || !bot) return;

    const timer = this.flushTimers.get(sessionPublicId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionPublicId);
    }

    const status =
      exitCode === null
        ? 'cancelled'
        : exitCode === 0
          ? 'finished'
          : `failed (exit ${exitCode})`;

    await Promise.allSettled(
      Array.from(entries).map(async ([streamId, entry]) => {
        entry.status = 'finished';
        entry.lastFlush = Date.now();

        const display = this.formatOutput(entry.readOutput().slice(-this.MAX_LENGTH));

        try {
          await bot.telegram.editMessageText(
            entry.chatId,
            entry.messageId,
            undefined,
            `<b>Session ${this.esc(sessionPublicId)}</b> ${status} (${Math.round(durationMs / 1000)}s)\n${display || '(no output)'}`,
            { parse_mode: 'HTML', reply_markup: this.finishedKeyboard(streamId, sessionPublicId) } as never,
          );
        } catch {
          entries.delete(streamId);
        }
      }),
    );

    if (entries.size === 0) {
      this.sessions.delete(sessionPublicId);
    }
  }
}
