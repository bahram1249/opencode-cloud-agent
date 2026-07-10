import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import type { CommandResult, RunningProcess } from 'src/common/types';

/**
 * Low-level command execution service shared by OpenCodeModule and BuildModule.
 * Spawns child processes, streams stdout/stderr, enforces timeout, supports
 * cancellation, and limits concurrency via a simple semaphore.
 *
 * SECURITY: Only `WHITELISTED_COMMANDS` may be executed. Any attempt to run
 * a command not in the whitelist throws immediately. No arbitrary shell input
 * from Telegram ever reaches the shell.
 */
export interface RunCommandOptions {
  /** Whitelisted binary to invoke (must exist in WHITELISTED_COMMANDS). */
  command: string;
  /** Arguments (never interpolated into a shell string). */
  args: readonly string[];
  /** Working directory. */
  cwd: string;
  /** Execution timeout in ms (0 = no timeout). */
  timeoutMs?: number;
  /** Environment overrides. */
  env?: Record<string, string>;
  /** Task id used for streaming events and tracking. */
  taskId?: string;
  /** Stage label (opencode, lint, test, build, typecheck, install, git). */
  stage?: string;
}

const WHITELISTED_COMMANDS = new Set([
  'opencode',
  'npm',
  'npx',
  'node',
  'git',
  'pnpm',
  'yarn',
  'tsc',
]);

@Injectable()
export class CommandRunnerService {
  private readonly logger = new Logger(CommandRunnerService.name);
  /** Active processes keyed by taskId+stage for cancellation. */
  private readonly active = new Map<string, RunningProcess>();
  /** Concurrency semaphore. */
  private readonly maxConcurrent: number;
  private currentConcurrent = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    this.maxConcurrent = this.config.get<number>('app.maxConcurrentTasks', 3);
  }

  /**
   * Run a whitelisted command, collecting output and respecting timeout.
   * Returns a CommandResult with exitCode, stdout, stderr, etc.
   */
  async run(opts: RunCommandOptions): Promise<CommandResult> {
    if (!WHITELISTED_COMMANDS.has(opts.command)) {
      throw new Error(
        `Command "${opts.command}" is not in the whitelist. ` +
          `Allowed: ${[...WHITELISTED_COMMANDS].join(', ')}`,
      );
    }

    await this.acquireSlot();

    const startedAt = Date.now();
    const key = `${opts.taskId ?? 'unknown'}:${opts.stage ?? opts.command}`;
    const timeoutMs = opts.timeoutMs ?? this.config.get<number>('app.taskTimeoutMs', 0);
    const fullCommand = `${opts.command} ${opts.args.join(' ')}`;

    this.logger.log(`Executing: ${fullCommand} (cwd: ${opts.cwd})`);

    return new Promise<CommandResult>((resolve) => {
      const child: ChildProcess = spawn(opts.command, opts.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let cancelled = false;
      let timeoutHandle: NodeJS.Timeout | undefined;
      let resolved = false;

      const finish = (exitCode: number | null): void => {
        if (resolved) return;
        resolved = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.active.delete(key);
        this.releaseSlot();

        const durationMs = Date.now() - startedAt;
        const result: CommandResult = {
          exitCode,
          stdout,
          stderr,
          timedOut,
          cancelled,
          durationMs,
          command: fullCommand,
        };
        this.logger.log(`Finished (${exitCode}) in ${durationMs}ms: ${fullCommand}`);
        resolve(result);
      };

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          this.logger.warn(`Timeout after ${timeoutMs}ms: ${fullCommand}`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!resolved) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, timeoutMs);
      }

      // Register for cancellation
      this.active.set(key, {
        taskId: opts.taskId ?? 'unknown',
        pid: child.pid ?? 0,
        stage: opts.stage ?? opts.command,
        startedAt,
        cancel: () => {
          cancelled = true;
          this.logger.warn(`Cancelling: ${fullCommand}`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!resolved) child.kill('SIGKILL');
          }, 5000);
        },
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        if (opts.taskId) {
          this.events.emit('execution.output', {
            taskId: opts.taskId,
            stage: opts.stage,
            stream: 'stdout',
            data: text,
          });
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        if (opts.taskId) {
          this.events.emit('execution.output', {
            taskId: opts.taskId,
            stage: opts.stage,
            stream: 'stderr',
            data: text,
          });
        }
      });

      child.on('error', (err) => {
        stderr += `\n[Spawn error: ${err.message}]`;
        finish(1);
      });

      child.on('close', (code) => {
        finish(code);
      });
    });
  }

  /** Cancel a running process by task id (and optional stage). */
  cancelTask(taskId: string): boolean {
    let cancelled = false;
    for (const [key, proc] of this.active.entries()) {
      if (proc.taskId === taskId) {
        proc.cancel();
        this.active.delete(key);
        cancelled = true;
      }
    }
    return cancelled;
  }

  /** Get all active processes for a task. */
  getActiveForTask(taskId: string): RunningProcess[] {
    return [...this.active.values()].filter((p) => p.taskId === taskId);
  }

  // ── Concurrency semaphore ──────────────────────────────────────────
  private async acquireSlot(): Promise<void> {
    if (this.currentConcurrent < this.maxConcurrent) {
      this.currentConcurrent++;
      return;
    }
    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    this.currentConcurrent++;
  }

  private releaseSlot(): void {
    this.currentConcurrent--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  /** Check if a command is whitelisted. Exposed for testing. */
  isWhitelisted(command: string): boolean {
    return WHITELISTED_COMMANDS.has(command);
  }
}
