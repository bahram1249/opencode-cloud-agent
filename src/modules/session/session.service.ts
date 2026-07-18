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
import { Terminal } from '@xterm/headless';
import type { CreateSessionDto } from './dto/session.dto';
import { AppEvents } from 'src/common/constants/workflow.constants';
import { WorkspaceService } from '../workspace/workspace.service';
import { DockerWorkspaceService } from '../workspace/docker-workspace.service';

// Buffer unfinished ANSI sequences across PTY data chunks
const rawBuffer = new Map<string, string>();

/** Convert terminal output to Telegram-safe HTML. */
function cleanOutput(sessionId: string, raw: string): string {
  // Prepend any leftover from previous chunk, then split again
  const prev = rawBuffer.get(sessionId) || '';
  let s = prev + raw;

  // Save trailing partial ANSI sequence for next chunk
  // eslint-disable-next-line no-control-regex
  const partialRe = /\x1B\[[\x30-\x3F]*$/;
  const partialMatch = s.match(partialRe);
  if (partialMatch) {
    rawBuffer.set(sessionId, partialMatch[0]);
    s = s.slice(0, partialMatch.index);
  } else {
    rawBuffer.delete(sessionId);
  }

  // ── Strip OSC (BEL or ST terminated), APC, PM, SOS sequences ─────
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1B[PX^_]./g, '');

  // ── Tokenize: CSI sequences + text ────────────────────────────────
  // Comprehensive CSI: ESC[ + params(0-9;:<=>?@) + intermed(space-/) + final(@-~)
  // eslint-disable-next-line no-control-regex
  const csiRe = /\x1B\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g;
  type Token = { t: 'text'; v: string } | { t: 'ansi'; v: string };
  const tokens: Token[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = csiRe.exec(s)) !== null) {
    if (m.index > lastIdx) tokens.push({ t: 'text', v: s.slice(lastIdx, m.index) });
    tokens.push({ t: 'ansi', v: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) tokens.push({ t: 'text', v: s.slice(lastIdx) });

  // ── Walk tokens: SGR → HTML, non-SGR → stripped, text → escaped ──
  let bold = false, uline = false, italic = false;
  const out: string[] = [];

  function closeAll() {
    let r = '';
    if (uline) { r += '</u>'; uline = false; }
    if (italic) { r += '</i>'; italic = false; }
    if (bold) { r += '</b>'; bold = false; }
    return r;
  }
  function openAll() {
    let r = '';
    if (bold) r += '<b>';
    if (italic) r += '<i>';
    if (uline) r += '<u>';
    return r;
  }

  for (const tok of tokens) {
    if (tok.t === 'text') {
      const txt = tok.v
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (txt) out.push(openAll() + txt + closeAll());
    } else {
      // SGR sequences end with 'm' — extract params for formatting
      const sgr = tok.v.match(/^\x1B\[([\d;]*)m$/);
      if (sgr) {
        const params = sgr[1] ? sgr[1].split(';').map(Number) : [0];
        for (const p of params) {
          if (p === 0 || p === 22 || p === 24 || p === 23) {
            if (p === 0 || p === 22) bold = false;
            if (p === 0 || p === 24) uline = false;
            if (p === 0 || p === 23) italic = false;
          } else if (p === 1) bold = true;
          else if (p === 4) uline = true;
          else if (p === 3) italic = true;
        }
      }
      // Non-SGR CSI tokens are simply discarded (stripped)
    }
  }

  let result = out.join('');

  // ── Strip TUI Unicode art ─────────────────────────────────────────
  // Box Drawing, Block Elements, Geometric Shapes, Miscellaneous Symbols
  result = result.replace(/[\u2500-\u257F]/g, '');  // Box Drawing
  result = result.replace(/[\u2580-\u259F]/g, '');  // Block Elements
  result = result.replace(/[\u25A0-\u25FF]/g, '');  // Geometric Shapes
  result = result.replace(/[\u2800-\u28FF]/g, '');  // Braille (spinners)
  result = result.replace(/[\u2B1B-\u2B1F]/g, ''); // ⬛⬝⬞
  result = result.replace(/[▣▢]/g, '');
  result = result.replace(/[⬝■]+/g, '');

  // ── Strip TUI status bar patterns ─────────────────────────────────
  result = result.replace(/·\s*\w[\w\s]+?[^\n]*?(?:Model|GitHub)/g, '');
  result = result.replace(/▣\s*Build[^\n]*/g, '');
  result = result.replace(/\d+\.\d+K\s*\(\d+%\)[^\n]*/g, '');
  result = result.replace(/\s*·\s*\$[\d.]+/g, '');
  result = result.replace(/➜\s*~/g, '');
  result = result.replace(/●\s*Tip[^\n]*/g, '');
  result = result.replace(/^\s*Build[\s·\w]+$/gm, '');
  result = result.replace(/^\s*Thought:\s*\d+ms/gm, '');

  // ── Remove orphaned ANSI-code text (ESC was in previous chunk) ───
  result = result.replace(/\[\?[\d;]*[\x20-\x2F]*[a-zA-Z]/g, '');  // DEC private ([?1016$p)
  result = result.replace(/\[>[\d;]*[a-zA-Z][\da-zA-Z]*/g, '');    // DA response ([>0qq4d73, [>4;1m)
  result = result.replace(/\[\d+(?:;\d+)*m/g, '');                 // SGR color ([48;2;40;44;52m)
  result = result.replace(/\]\d+;[\w=?;:-]+/g, '');                // OSC remnants (]99;opentui, ]1337;Capabilities)

  // ── Remove pure-TUI-chrome lines ──────────────────────────────────
  const chromeRe = /^[\s\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2800-\u28FF⬝■▪▫▬▲▼▶◆◇○◉◎●◐◑◒◓◔◕◖◗◦◯┃│]+$/;
  const statusRe = /^\s*(esc interrupt|tab agents|ctrl\+p commands|Ask anything)/i;
  result = result.split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.length > 0 && !chromeRe.test(l) && !statusRe.test(l))
    .join('\n');

  // ── Convert numbered options to HTML lists ────────────────────────
  const lines = result.split('\n');
  const formatted: string[] = [];
  let inList = false;

  for (const line of lines) {
    const opt = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (opt) {
      if (!inList) { formatted.push('<ul>'); inList = true; }
      formatted.push(`  <li><code>${opt[1]}.</code> ${opt[2]}</li>`);
    } else {
      if (inList) { formatted.push('</ul>'); inList = false; }
      formatted.push(line);
    }
  }
  if (inList) formatted.push('</ul>');

  return formatted.join('\n');
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
  terminal: Terminal;
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
    private readonly dockerWorkspaces: DockerWorkspaceService,
    private readonly events: EventEmitter2,
  ) {
    // Ensure node-pty native binaries are executable (npm install sometimes drops perms)
    try {
      const ptyDir = resolve(__dirname, '..', '..', '..', '..', 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`);
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
      ? (await this.workspaceService.findByName(dto.workspaceName, telegramUserId)) ??
        (await this.workspaceService.findById(dto.workspaceName, telegramUserId))
      : await this.workspaceService.getActive(telegramUserId);

    if (!workspace) {
      throw new BadRequestException(
        'No active workspace. Create one: /workspace create <name>',
      );
    }

    const syncResults = await this.workspaceService.syncProjects(workspace.id, telegramUserId);
    const failedSync = syncResults.filter((r) => !r.ok);
    if (failedSync.length > 0) {
      this.logger.warn(`Workspace ${workspace.name} git sync completed with ${failedSync.length} warning(s)`);
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

    const creds = await this.workspaceService.getWorkspaceCredentials(workspace.id);
    const ensuredContainerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: workspace.id,
      tenantId: workspace.tenantId,
      workDir: workspace.workDir,
      providerId: workspace.providerId,
      apiKey: creds.apiKey,
      model: dto.model ?? workspace.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    if (!ensuredContainerId) {
      throw new BadRequestException(
        'Docker container is not available. Workspace containers must be enabled to run sessions.',
      );
    }
    const spawnCommand = 'docker';
    const opencodeArgs = ['--prompt', dto.prompt, ...(dto.model ?? workspace.model ? ['--model', dto.model ?? workspace.model ?? ''] : [])];
    const execEnv = this.dockerWorkspaces.buildProviderEnv({
      workspaceId: workspace.id,
      tenantId: workspace.tenantId,
      workDir: workspace.workDir,
      providerId: workspace.providerId,
      apiKey: creds.apiKey,
      model: dto.model ?? workspace.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    const spawnArgs = this.dockerWorkspaces.dockerExecArgs(ensuredContainerId, workspace.workDir, 'opencode', opencodeArgs, execEnv);
    const ptyProcess = pty.spawn(spawnCommand, spawnArgs, {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd: workspace.workDir,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const terminal = new Terminal({ cols: 120, rows: 40, allowProposedApi: true });
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
      terminal,
      running: true,
    };

    this.sessions.set(sessionRec.id, session);
    this.userSessions.set(telegramUserId, sessionRec.id);

    await this.prisma.openCodeSession.update({
      where: { id: sessionRec.id },
      data: { pid: ptyProcess.pid },
    });

    this.logger.log(`Session ${publicId} PTY started (pid: ${ptyProcess.pid})`);

    // PTY data event — feed raw to xterm for screen buffer, cleaned for history
    ptyProcess.onData((raw: string) => {
      session.terminal.write(raw);
      const clean = cleanOutput(sessionRec.id, raw);
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
      rawBuffer.delete(sessionRec.id);
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
  async sendToSession(sessionId: string, text: string, cwd?: string): Promise<void> {
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
        const workspace = await this.prisma.workspace.findUnique({ where: { id: session.workspaceId } });
        if (!workspace?.containerId) {
          throw new BadRequestException('Workspace has no container; cannot spawn follow-up PTY.');
        }
        const spawnCommand = 'docker';
        const creds = await this.workspaceService.getWorkspaceCredentials(workspace.id);
        const execEnv = this.dockerWorkspaces.buildProviderEnv({
          workspaceId: workspace.id,
          tenantId: workspace.tenantId,
          workDir: workspace.workDir,
          providerId: workspace.providerId,
          apiKey: creds.apiKey,
          model: workspace.model,
          gitToken: creds.gitToken,
          gitUsername: creds.gitUsername,
        });
        const spawnArgs = this.dockerWorkspaces.dockerExecArgs(workspace.containerId, cwd ?? session.workspaceDir, 'opencode', ['--prompt', text], execEnv);
        const newPty = pty.spawn(spawnCommand, spawnArgs, {
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
          session.terminal.write(raw);
          const clean = cleanOutput(session.id, raw);
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
