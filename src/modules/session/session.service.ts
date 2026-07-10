import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { execSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { CreateSessionDto } from './dto/session.dto';
import { AppEvents } from 'src/common/constants/workflow.constants';
import { WorkspaceService } from '../workspace/workspace.service';

/** Strip ANSI escape codes from terminal output. */
function cleanOutput(raw: string): string {
  // Step 1: Strip ALL ANSI escape sequences
  let s = raw;
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '');  // CSI sequences (including ? params)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1B\][^\x07]*\x07/g, '');       // OSC title sequences (terminated by BEL)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1B[PX^_]./g, '');              // APC/PM/SOS single-char

  // Step 2: Strip Unicode TUI/box-drawing characters
  s = s.replace(/[\u2500-\u257F]/g, '');          // Box Drawing
  s = s.replace(/[\u2580-\u259F]/g, '');          // Block Elements
  s = s.replace(/[\u2800-\u28FF]/g, '');          // Braille Patterns (⠋⠙⠹ spinner)
  s = s.replace(/[\u25A0-\u25FF]/g, '');          // Geometric Shapes (■□▣)
  s = s.replace(/[\u2B1B-\u2B1F]/g, '');          // ⬛⬝⬞ squares
  s = s.replace(/[┌┐└┘├┤┬┴┼╭╮╯╰╱╲╳╹╺╻╼╽╾╿▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▐░▒▓▔▕]/g, '');

  // Step 3: Strip known TUI status patterns
  s = s.replace(/·\s*DeepSeek[^\n]*/g, '');       // Model name in status bar
  s = s.replace(/▣\s*Build[^\n]*/g, '');          // Build status
  s = s.replace(/➜\s*~/g, '');                    // Shell prompt
  s = s.replace(/\d+\.\d+K\s*\(\d+%\)[^\n]*/g, ''); // Progress: 27.3K (3%)
  s = s.replace(/\s*·\s*\$[\d.]+/g, '');          // Cost: · $0.00

  // Step 4: Remove lines that are only TUI chrome or status bars
  const lines = s.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .filter(l => !/^[\s⬝■▪▫▬▲▼▶◆◇○◉◎●◐◑◒◓◔◕◖◗◦◯┃│]+$/.test(l))  // Pure TUI
    .filter(l => !/^(esc interrupt|tab agents|ctrl\+p commands)/i.test(l)); // Status bar labels

  return lines.join('\n');
}

export interface ActiveSession {
  id: string;
  publicId: string;
  pty: IPty;
  pid: number;
  workspaceId: string;
  workspaceName: string;
  workspaceDir: string;
  chatId: string;
  createdBy: string;
  prompt: string;
  startedAt: number;
  emitter: EventEmitter;
  outputBuffer: string;
  running: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly userSessions = new Map<string, string>();
  private readonly opencodePath: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly workspaceService: WorkspaceService,
    private readonly events: EventEmitter2,
  ) {
    // Ensure node-pty native binaries are executable (npm install sometimes drops perms)
    try {
      const ptyDir = resolve(__dirname, '..', '..', '..', 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`);
      const helper = resolve(ptyDir, 'spawn-helper');
      chmodSync(helper, 0o755);
      const native = resolve(ptyDir, 'pty.node');
      chmodSync(native, 0o755);
      this.logger.log(`node-pty binaries permission-fixed in ${ptyDir}`);
    } catch {
      // Non-fatal — node-pty might be in a different location (pnp, etc.)
    }

    let rawPath = this.config.get<string>('app.opencodePath', 'opencode');
    if (!rawPath.includes('/')) {
      try {
        rawPath = execSync(`which ${rawPath}`, { encoding: 'utf-8' }).trim();
      } catch {
        this.logger.warn(`Could not resolve '${rawPath}' via which, using raw path`);
      }
    }
    this.opencodePath = rawPath;
    this.logger.log(`OpenCode binary: ${this.opencodePath}`);
  }

  async createSession(
    dto: CreateSessionDto,
    telegramUserId: string,
    chatId: string,
  ): Promise<ActiveSession> {
    const workspace = dto.workspaceName
      ? (await this.workspaceService.findByName(dto.workspaceName)) ??
        (await this.workspaceService.findById(dto.workspaceName))
      : await this.workspaceService.getActive();

    if (!workspace) {
      throw new BadRequestException(
        'No active workspace. Create one: /workspace create <name> <path>',
      );
    }

    const publicId = await this.generatePublicId();

    const sessionRec = await this.prisma.openCodeSession.create({
      data: {
        publicId,
        createdBy: telegramUserId,
        workspaceId: workspace.id,
        prompt: dto.prompt,
        active: true,
        streaming: true,
        chatId,
        startedAt: new Date(),
      },
    });

    const emitter = new EventEmitter();

    // Create a real PTY (pseudo-terminal) — tricks opencode into thinking
    // it's running in a real terminal. Fixes output buffering, colors,
    // progress indicators, and interactive prompts.
    this.logger.log(`Spawning PTY: ${this.opencodePath} in ${workspace.workDir}`);

    const ptyProcess = pty.spawn(this.opencodePath, ['--prompt', dto.prompt], {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd: workspace.workDir,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const session: ActiveSession = {
      id: sessionRec.id,
      publicId,
      pty: ptyProcess,
      pid: ptyProcess.pid,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceDir: workspace.workDir,
      chatId,
      createdBy: telegramUserId,
      prompt: dto.prompt,
      startedAt: Date.now(),
      emitter,
      outputBuffer: '',
      running: true,
    };

    this.sessions.set(sessionRec.id, session);
    this.userSessions.set(telegramUserId, sessionRec.id);

    await this.prisma.openCodeSession.update({
      where: { id: sessionRec.id },
      data: { pid: ptyProcess.pid },
    });

    this.logger.log(`Session ${publicId} PTY started (pid: ${ptyProcess.pid})`);

    // PTY data event — captures ALL output, strips ANSI + TUI
    ptyProcess.onData((raw: string) => {
      const clean = cleanOutput(raw);
      if (!clean) return;
      session.outputBuffer += clean + '\n';
      session.emitter.emit('output', clean);
      this.events.emit(AppEvents.ExecutionOutput, {
        sessionId: sessionRec.id,
        stream: 'stdout',
        data: clean,
      });
    });

    // PTY exit event
    ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      session.running = false;
      const durationMs = Date.now() - session.startedAt;

      const signalStr = signal !== undefined ? ` (signal: ${signal})` : '';

      this.prisma.openCodeSession
        .update({
          where: { id: sessionRec.id },
          data: {
            active: false,
            finishedAt: new Date(),
            durationMs,
            output: session.outputBuffer,
            pid: ptyProcess.pid,
            errorMessage: exitCode !== 0 ? `Exit code: ${exitCode}${signalStr}` : null,
          },
        })
        .catch((err: unknown) => {
          this.logger.error(`Session DB update error: ${(err as Error).message}`);
        });

      this.userSessions.delete(telegramUserId);
      emitter.emit('exit', exitCode, durationMs);
      this.events.emit(AppEvents.SessionFinished, {
        sessionId: sessionRec.id,
        publicId,
        exitCode,
      });
      this.logger.log(
        `Session ${publicId} PTY exited (code: ${exitCode}, duration: ${durationMs}ms)`,
      );
    });

    return session;
  }

  /**
   * Send text to the active PTY session. If the PTY is still alive, write
   * to it. Otherwise spawn a new PTY for the follow-up prompt.
   */
  sendToSession(sessionId: string, text: string, cwd?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    try {
      session.pty.write(text + '\n');
      this.logger.log(`Wrote to PTY ${session.publicId}: ${text.slice(0, 100)}`);
    } catch {
      // PTY might be dead — spawn a new one
      this.logger.log(`PTY write failed, spawning new for: ${text.slice(0, 100)}`);
      try {
        const newPty = pty.spawn(this.opencodePath, ['--prompt', text], {
          name: 'xterm-color',
          cols: 120,
          rows: 40,
          cwd: cwd ?? session.workspaceDir,
          env: { ...process.env, TERM: 'xterm-256color' },
        });

        const oldPid = session.pid;
        session.pty = newPty;
        session.pid = newPty.pid;
        session.running = true;

        newPty.onData((raw: string) => {
          const clean = cleanOutput(raw);
          if (!clean) return;
          session.outputBuffer += clean + '\n';
          session.emitter.emit('output', clean);
          this.events.emit(AppEvents.ExecutionOutput, {
            sessionId: session.id,
            stream: 'stdout',
            data: clean,
          });
        });

        newPty.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
          session.running = false;
          session.emitter.emit('exit', exitCode, Date.now() - session.startedAt);
          this.logger.log(`Session ${session.publicId} follow-up PTY exited (code: ${exitCode})`);
        });

        this.logger.log(
          `Session ${session.publicId} new PTY (pid: ${newPty.pid}) replacing old (pid: ${oldPid})`,
        );
      } catch (spawnErr) {
        throw new BadRequestException(
          `Failed to start opencode for follow-up: ${(spawnErr as Error).message}`,
        );
      }
    }
  }

  /** Switch which session is active for a user. */
  switchUserSession(telegramUserId: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.userSessions.set(telegramUserId, sessionId);
    return true;
  }

  /** Send a special keypress to the PTY (Tab, Enter, Arrow keys, Ctrl+C). */
  sendKey(sessionId: string, key: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.running) {
      throw new NotFoundException(`Session ${sessionId} not active`);
    }
    const keyMap: Record<string, string> = {
      tab: '\t',
      enter: '\r',
      up: '\x1b[A',
      down: '\x1b[B',
      right: '\x1b[C',
      left: '\x1b[D',
      'ctrl+c': '\x03',
      'ctrl+d': '\x04',
      escape: '\x1b',
      home: '\x1b[H',
      end: '\x1b[F',
      'page-up': '\x1b[5~',
      'page-down': '\x1b[6~',
    };
    const seq = keyMap[key.toLowerCase()];
    if (!seq) throw new BadRequestException(`Unknown key: ${key}. Supported: ${Object.keys(keyMap).join(', ')}`);
    session.pty.write(seq);
    this.logger.log(`Sent key '${key}' to session ${session.publicId}`);
  }

  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.pty.kill('SIGTERM');
      setTimeout(() => {
        if (this.sessions.has(sessionId) && session.running) {
          try {
            session.pty.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
      }, 3000);
    } catch {
      /* ignore */
    }

    return true;
  }

  getActiveSession(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSession(telegramUserId: string): ActiveSession | undefined {
    const sessionId = this.userSessions.get(telegramUserId);
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.userSessions.delete(telegramUserId);
      return undefined;
    }
    return session;
  }

  getUserSessions(telegramUserId: string): ActiveSession[] {
    return [...this.sessions.values()].filter((s) => s.createdBy === telegramUserId);
  }

  getAllActiveSessions(): ActiveSession[] {
    return [...this.sessions.values()].filter((s) => s.running);
  }

  async listSessions(query: {
    active?: boolean;
    createdBy?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.active !== undefined) where.active = query.active;
    if (query.createdBy) where.createdBy = query.createdBy;

    const [items, total] = await Promise.all([
      this.prisma.openCodeSession.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { workspace: { select: { name: true, workDir: true } } },
      }),
      this.prisma.openCodeSession.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  private async generatePublicId(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let id = 's-';
      for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      const exists = await this.prisma.openCodeSession.findUnique({
        where: { publicId: id },
        select: { id: true },
      });
      if (!exists) return id;
    }
    throw new Error('Failed to generate unique public id');
  }
}
