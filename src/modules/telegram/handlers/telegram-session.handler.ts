import { Injectable, Logger } from '@nestjs/common';
import type { TelegramContext } from '../telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { SessionService } from 'src/modules/session/session.service';
import { StreamService } from 'src/modules/stream/stream.service';
import { showMainMenu, showSessionContext, type MenuServices } from '../ui/telegram-menus';
import { cb } from '../utils/telegram-callback.utils';
import { Markup } from 'telegraf';

@Injectable()
export class TelegramSessionHandler {
  private readonly logger = new Logger(TelegramSessionHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly sessionService: SessionService,
    private readonly streamService: StreamService,
  ) {}

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: this.sessionService,
    };
  }

  async handleTextInput(chatId: string, userId: string, text: string, isInSetupWizard: boolean): Promise<void> {
    if (isInSetupWizard) {
      return;
    }

    const existing = this.sessionService.getUserSession(userId);
    if (existing) {
      await this.handleSendToSession(chatId, userId, text);
    } else {
      await this.handleStartSession(chatId, userId, text);
    }
  }

  async handleStartSessionCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await this.notificationService.sendRaw(chatId, 'Usage: /session <prompt>\nExample: /session Fix the login bug');
      return;
    }

    await this.handleStartSession(chatId, userId, prompt);
  }

  async handleSendCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    const text = args.join(' ').trim();

    if (!text) {
      await this.notificationService.sendRaw(chatId, 'Usage: /send <text>');
      return;
    }

    await this.handleSendToSession(chatId, userId, text);
  }

  async handleCancelCmd(chatId: string, userId: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    this.sessionService.cancelSession(session.id);
    await this.notificationService.sendRaw(chatId, `🛑 Session ${session.publicId} cancelled.`);
    await showMainMenu(chatId, userId, this.menuSvc);
  }

  async handleKeyCmd(chatId: string, userId: string, key: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    try {
      this.sessionService.sendKey(session.id, key);
      await this.notificationService.sendRaw(chatId, `⌨️ Sent: ${key}`);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Key error: ${(err as Error).message}`);
    }
  }

  async handleKeyAction(chatId: string, userId: string, key: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    try {
      this.sessionService.sendKey(session.id, key);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Key error: ${(err as Error).message}`);
    }
  }

  async handleSessionsCmd(chatId: string, userId: string): Promise<void> {
    const userSessions = this.sessionService.getUserSessions(userId);
    const active = this.sessionService.getUserSession(userId);

    if (userSessions.length === 0) {
      await this.notificationService.sendRaw(chatId, 'No sessions. Send a prompt to start one.');
      return;
    }

    const lines = userSessions.map((s) => {
      const isActive = active && (active.id === s.id || active.publicId === s.publicId);
      const procStatus = s.running ? `PID ${s.pid ?? '?'}` : 'stopped';
      return `${isActive ? '👉 ' : '  '}${s.publicId} | ${procStatus} | ${s.workspaceName} | ${s.prompt.slice(0, 40)}`;
    });

    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

    for (const s of userSessions) {
      const isActive = active && (active.id === s.id || active.publicId === s.publicId);
      const btns: Array<ReturnType<typeof Markup.button.callback>> = [];
      btns.push(Markup.button.callback(`📋 Show ${s.publicId}`, cb('sess:show', s.id)));
      if (!isActive) {
        btns.push(Markup.button.callback(`👉 Switch`, cb('sess:switch', s.id)));
      }
      btns.push(Markup.button.callback(`❌ Close`, cb('sess:cancel', s.id)));
      rows.push(btns);
    }
    rows.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `📋 *Your Sessions*\n${lines.join('\n')}`,
      Markup.inlineKeyboard(rows),
    );
  }

  async handleSessCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    switch (type) {
      case 'sess:show': {
        const session = this.sessionService.getActiveSession(value);
        if (session) {
          await this.streamService.showSessionOutput(
            chatId,
            session.publicId,
            session.outputBuffer,
            session.running,
          );
        } else {
          await this.notificationService.sendRaw(chatId, 'Session not found.');
        }
        break;
      }
      case 'sess:cancel': {
        const targetId = value || this.sessionService.getUserSession(userId)?.id || '';
        if (targetId) {
          this.sessionService.cancelSession(targetId);
          await this.notificationService.sendRaw(chatId, `🛑 Session cancelled.`);
        }
        await showMainMenu(chatId, userId, this.menuSvc);
        break;
      }
      case 'sess:switch': {
        if (value) {
          const ok = this.sessionService.switchUserSession(userId, value);
          if (ok) {
            const session = this.sessionService.getActiveSession(value);
            if (session) {
              await this.streamService.createStreamView(chatId, session.publicId, () => {
                const buf = session.terminal.buffer.active;
                const rows = session.terminal.rows;
                const start = buf.viewportY;
                const lines: string[] = [];
                for (let y = start; y < start + rows; y++) {
                  const line = buf.getLine(y);
                  if (line) lines.push(line.translateToString().trimEnd());
                }
                return lines.filter(l => l.length > 0).join('\n');
              });
              await this.notificationService.sendRaw(chatId, `👉 Switched to session ${session.publicId}`);
              await showSessionContext(chatId, userId, session, this.menuSvc);
            }
          } else {
            await this.notificationService.sendRaw(chatId, 'Session not found.');
          }
        }
        break;
      }
      case 'sess:refresh': {
        const colonIdx = value.indexOf(':');
        if (colonIdx > 0) {
          const publicId = value.slice(0, colonIdx);
          const streamId = value.slice(colonIdx + 1);
          await this.streamService.refreshEntry(publicId, streamId);
        }
        break;
      }
      case 'sess:new': {
        await this.notificationService.sendRaw(chatId, 'Send a prompt and I\'ll start a new session.');
        break;
      }
    }
  }

  private async handleStartSession(chatId: string, userId: string, prompt: string): Promise<void> {
    let active = await this.workspaceService.getActive(userId);
    if (!active) {
      const all = await this.workspaceService.findAll(userId);
      if (all.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          'No workspaces found. Create one:\n/workspace create <name>',
        );
        return;
      }
      active = all[0] ?? null;
      if (!active) return;
      await this.workspaceService.setActive(active.id, userId);
    }

    try {
      const session = await this.sessionService.createSession({ prompt }, userId, chatId);

      await this.streamService.sendSessionStart(chatId, session.publicId, () => {
        const buf = session.terminal.buffer.active;
        const rows = session.terminal.rows;
        const start = buf.viewportY;
        const lines: string[] = [];
        for (let y = start; y < start + rows; y++) {
          const line = buf.getLine(y);
          if (line) {
            lines.push(line.translateToString().trimEnd());
          }
        }
        return lines.filter(l => l.length > 0).join('\n');
      });

      session.emitter.on('output', (text: string) => {
        this.streamService.appendOutput(session.publicId, text);
      });

      session.emitter.on('exit', (code: number | null, durationMs: number) => {
        void this.streamService.sendSessionEnd(session.publicId, code, durationMs);
        void showMainMenu(chatId, userId, this.menuSvc);
      });

      session.emitter.on('error', (msg: string) => {
        void this.notificationService.sendRaw(chatId, `Session error: ${msg}`);
      });

      await showSessionContext(chatId, userId, session, this.menuSvc);

      this.logger.log(`Session ${session.publicId} started for user ${userId}`);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Session error: ${(err as Error).message}`);
    }
  }

  private async handleSendToSession(chatId: string, userId: string, text: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.handleStartSession(chatId, userId, text);
      return;
    }

    try {
      await this.sessionService.sendToSession(session.id, text);
      await this.notificationService.sendRaw(chatId, `📤 Sent to session: ${text.slice(0, 200)}`);
    } catch (err) {
      this.sessionService.cancelSession(session.id);
      await this.notificationService.sendRaw(
        chatId,
        `Session process ended. ${(err as Error).message}`,
      );
      await showMainMenu(chatId, userId, this.menuSvc);
    }
  }
}
