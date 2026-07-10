import { Injectable, Logger } from '@nestjs/common';
import { execFile, type ExecFileException } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

export interface GitDiffResult {
  files: string[];
  diff: string;
  stat: string;
}

export interface GitCommitResult {
  sha: string;
  message: string;
}

/**
 * Git operations service. All git invocations use `execFile` (no shell), and
 * the binary is whitelisted in CommandRunnerService. Handles: branch creation,
 * diff, commit, push, tag, rollback.
 */
@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);
  private readonly githubToken: string;

  constructor(private readonly config: ConfigService) {
    this.githubToken = this.config.get<string>('app.githubToken', '');
  }

  /** Detect changed (unstaged + staged) files in a repository. */
  async getChangedFiles(cwd: string): Promise<GitDiffResult> {
    const diff = await this.git(cwd, ['diff', '--no-color']);
    const staged = await this.git(cwd, ['diff', '--cached', '--no-color']);
    const stat = await this.git(cwd, ['diff', '--stat']);
    const stagedStat = await this.git(cwd, ['diff', '--cached', '--stat']);
    const files = await this.git(cwd, ['status', '--porcelain']);

    const fileList = files
      .split('\n')
      .map((l) => l.trim().slice(3))
      .filter(Boolean);

    return {
      files: fileList,
      diff: diff + staged,
      stat: stat + stagedStat,
    };
  }

  /** Create and checkout a new branch off the current one. */
  async createBranch(cwd: string, branchName: string): Promise<void> {
    this.logger.log(`Creating branch ${branchName} in ${cwd}`);
    await this.git(cwd, ['checkout', '-b', branchName]);
  }

  /** Stage all changes and commit with the given message. */
  async commit(cwd: string, message: string): Promise<GitCommitResult> {
    await this.git(cwd, ['add', '-A']);
    await this.git(cwd, ['commit', '-m', message]);
    const sha = (await this.git(cwd, ['rev-parse', 'HEAD'])).trim();
    return { sha, message };
  }

  /** Push the current branch to origin, setting upstream. */
  async push(cwd: string, branchName: string, remote = 'origin'): Promise<void> {
    this.logger.log(`Pushing ${branchName} to ${remote}`);
    const env = this.githubToken
      ? { ...process.env, GIT_ASKPASS: undefined, GIT_TERMINAL_PROMPT: '0' }
      : process.env;
    await this.git(cwd, ['push', '-u', remote, branchName], env);
  }

  /** Create a tag at HEAD. */
  async createTag(cwd: string, tagName: string, message?: string): Promise<void> {
    const args = message ? ['tag', '-a', tagName, '-m', message] : ['tag', tagName];
    await this.git(cwd, args);
  }

  /** Push tags to remote. */
  async pushTags(cwd: string, remote = 'origin'): Promise<void> {
    await this.git(cwd, ['push', remote, '--tags']);
  }

  /** Rollback to a previous commit (hard reset). */
  async rollback(cwd: string, commitSha: string): Promise<void> {
    this.logger.warn(`Rolling back to ${commitSha} in ${cwd}`);
    await this.git(cwd, ['reset', '--hard', commitSha]);
  }

  /** Get the current HEAD commit SHA. */
  async getHeadSha(cwd: string): Promise<string> {
    return (await this.git(cwd, ['rev-parse', 'HEAD'])).trim();
  }

  /** Get the current branch name. */
  async getCurrentBranch(cwd: string): Promise<string> {
    return (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  }

  /** Discard all uncommitted changes. */
  async discardChanges(cwd: string): Promise<void> {
    await this.git(cwd, ['checkout', '--', '.']);
    await this.git(cwd, ['clean', '-fd']);
  }

  // ── Internal helpers ──────────────────────────────────────────────
  /**
   * Execute a git command. Uses execFile (not shell) so arguments are passed
   * safely. The git binary is whitelisted in CommandRunnerService.
   */
  private async git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        env: env ?? process.env,
      });
      return stdout;
    } catch (err) {
      const e = err as ExecFileException;
      const stderr = e.stderr?.toString() ?? '';
      throw new Error(`git ${args.join(' ')} failed: ${e.message}\n${stderr}`);
    }
  }
}
