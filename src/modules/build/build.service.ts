import { Injectable, Logger } from '@nestjs/common';
import { CommandRunnerService, type RunCommandOptions } from '../opencode/command-runner.service';
import type { CommandResult } from 'src/common/types';

export interface BuildOptions {
  taskId: string;
  cwd: string;
  installCommand?: string;
  lintCommand?: string;
  buildCommand?: string;
  testCommand?: string;
  typecheckCommand?: string;
  timeoutMs?: number;
}

export interface BuildResult {
  install?: CommandResult;
  lint?: CommandResult;
  typecheck?: CommandResult;
  build?: CommandResult;
  test?: CommandResult;
  success: boolean;
  failedStage?: string;
}

/**
 * Runs the full build pipeline: install, lint, typecheck, build, test.
 * Each step is executed via the shared CommandRunnerService (whitelisted
 * commands only). Returns a combined BuildResult with per-stage output.
 */
@Injectable()
export class BuildService {
  private readonly logger = new Logger(BuildService.name);

  constructor(private readonly runner: CommandRunnerService) {}

  /** Run the full pipeline for a task. Stops on first failure. */
  async runPipeline(opts: BuildOptions): Promise<BuildResult> {
    const result: BuildResult = { success: true };
    const stages: Array<{ name: string; command?: string; stage: string }> = [
      { name: 'install', command: opts.installCommand, stage: 'install' },
      { name: 'lint', command: opts.lintCommand, stage: 'lint' },
      { name: 'typecheck', command: opts.typecheckCommand, stage: 'typecheck' },
      { name: 'build', command: opts.buildCommand, stage: 'build' },
      { name: 'test', command: opts.testCommand, stage: 'test' },
    ];

    for (const stage of stages) {
      if (!stage.command) {
        this.logger.log(`Skipping ${stage.name} (no command configured)`);
        continue;
      }

      const cmdResult = await this.runStage(opts, stage.name, stage.command, stage.stage);
      (result as unknown as Record<string, unknown>)[stage.name] = cmdResult;

      if (cmdResult.exitCode !== 0) {
        result.success = false;
        result.failedStage = stage.name;
        this.logger.error(`Task ${opts.taskId}: ${stage.name} failed (exit ${cmdResult.exitCode})`);
        return result;
      }
      this.logger.log(`Task ${opts.taskId}: ${stage.name} passed`);
    }

    return result;
  }

  /** Run a single stage. Exposed for the workflow engine to call individually. */
  async runStage(
    opts: BuildOptions,
    name: string,
    command: string,
    stageLabel: string,
  ): Promise<CommandResult> {
    const [bin, ...args] = this.parseCommand(command);
    if (!bin) {
      throw new Error(`Invalid command for ${name}: ${command}`);
    }

    const runOpts: RunCommandOptions = {
      command: bin,
      args,
      cwd: opts.cwd,
      taskId: opts.taskId,
      stage: stageLabel,
      timeoutMs: opts.timeoutMs,
    };

    return this.runner.run(runOpts);
  }

  /**
   * Parse a command string into [binary, ...args]. Splits on whitespace but
   * does NOT invoke a shell — the binary must be whitelisted. Supports simple
   * `npm run test -- --coverage` style args.
   */
  private parseCommand(command: string): string[] {
    return command.trim().split(/\s+/);
  }
}
