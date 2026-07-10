import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandRunnerService, type RunCommandOptions } from './command-runner.service';
import type { CommandResult } from 'src/common/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/common/constants/workflow.constants';

export interface OpenCodeRunOptions {
  taskId: string;
  prompt: string;
  cwd: string;
  profile?: string;
  timeoutMs?: number;
}

/**
 * Interacts with the OpenCode CLI. Invokes `opencode` as a child process,
 * passing the prompt as a non-interactive argument. Streams stdout/stderr via
 * the CommandRunnerService and emits events for the workflow engine.
 *
 * SECURITY: Only the `opencode` binary is invoked here. The prompt is passed
 * as a CLI argument, never through a shell string.
 */
@Injectable()
export class OpenCodeService {
  private readonly logger = new Logger(OpenCodeService.name);

  constructor(
    private readonly runner: CommandRunnerService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Execute an OpenCode prompt in the given repository directory.
   * Returns the full CommandResult (stdout, stderr, exitCode, etc.).
   */
  async executePrompt(opts: OpenCodeRunOptions): Promise<CommandResult> {
    const opencodePath = this.config.get<string>('app.opencodePath', 'opencode');
    const args: string[] = ['--prompt', opts.prompt];

    if (opts.profile) {
      args.push('--profile', opts.profile);
    }

    const runOpts: RunCommandOptions = {
      command: opencodePath,
      args,
      cwd: opts.cwd,
      taskId: opts.taskId,
      stage: 'opencode',
      timeoutMs: opts.timeoutMs,
    };

    this.logger.log(`Task ${opts.taskId}: starting OpenCode`);
    this.events.emit(AppEvents.TaskLog, {
      taskId: opts.taskId,
      level: 'info',
      message: `Starting OpenCode: ${opts.prompt.slice(0, 100)}...`,
    });

    const result = await this.runner.run(runOpts);

    if (result.exitCode === 0) {
      this.logger.log(`Task ${opts.taskId}: OpenCode finished successfully`);
    } else if (result.cancelled) {
      this.logger.warn(`Task ${opts.taskId}: OpenCode was cancelled`);
    } else if (result.timedOut) {
      this.logger.error(`Task ${opts.taskId}: OpenCode timed out`);
    } else {
      this.logger.error(`Task ${opts.taskId}: OpenCode failed with exit code ${result.exitCode}`);
    }

    return result;
  }

  /** Cancel an in-flight OpenCode execution. */
  cancel(taskId: string): boolean {
    return this.runner.cancelTask(taskId);
  }

  /** Check if any OpenCode process is active for a task. */
  isActive(taskId: string): boolean {
    return this.runner.getActiveForTask(taskId).length > 0;
  }
}
