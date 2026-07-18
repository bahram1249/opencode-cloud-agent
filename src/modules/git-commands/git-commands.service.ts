import { Injectable, Logger } from '@nestjs/common';
import { execFile, type ExecFileException } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export interface GitStatusResult {
  branch: string;
  clean: boolean;
  files: string[];
  ahead: number;
  behind: number;
}

export interface GitLogResult {
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
}

@Injectable()
export class GitCommandsService {
  private readonly logger = new Logger(GitCommandsService.name);

  async clone(cwd: string, remoteUrl: string, targetPath: string, containerId?: string, credentials?: { username: string; token: string }): Promise<string> {
    const args = targetPath === '.' ? ['clone', remoteUrl, '.'] : ['clone', remoteUrl, targetPath];
    return this.git(cwd, args, containerId, credentials);
  }

  async branch(cwd: string, containerId?: string): Promise<{ current: string; branches: string[] }> {
    const output = await this.git(cwd, ['branch', '-a'], containerId);
    const lines = output.split('\n').filter(Boolean);
    let current = '';
    const branches: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (line.startsWith('* ')) {
        current = trimmed.slice(2);
      }
      branches.push(trimmed);
    }
    return { current, branches };
  }

  async checkout(cwd: string, branchName: string, containerId?: string): Promise<string> {
    return this.git(cwd, ['checkout', branchName], containerId);
  }

  async stash(cwd: string, message?: string, containerId?: string): Promise<string> {
    const args = ['stash', 'push', '-m', message ?? 'auto-stash'];
    return this.git(cwd, args, containerId);
  }

  async status(cwd: string, containerId?: string): Promise<GitStatusResult> {
    const branch = (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], containerId)).trim();
    const status = await this.git(cwd, ['status', '--porcelain'], containerId);
    const files = status.split('\n').filter(Boolean);
    const clean = files.length === 0;

    let ahead = 0;
    let behind = 0;
    try {
      const revList = await this.git(cwd, ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`], containerId);
      const parts = revList.trim().split('\t');
      ahead = parseInt(parts[0] ?? '0', 10);
      behind = parseInt(parts[1] ?? '0', 10);
    } catch {
      // no remote tracking
    }

    return { branch, clean, files, ahead, behind };
  }

  async diff(cwd: string, pathspec?: string, containerId?: string): Promise<string> {
    const args = ['diff', '--no-color'];
    if (pathspec) args.push('--', pathspec);
    return this.git(cwd, args, containerId);
  }

  async add(cwd: string, pathspec?: string, containerId?: string): Promise<string> {
    const args = ['add', pathspec ?? '-A'];
    return this.git(cwd, args, containerId);
  }

  async commit(cwd: string, message: string, containerId?: string): Promise<{ sha: string; message: string }> {
    await this.git(cwd, ['commit', '-m', message], containerId);
    const sha = (await this.git(cwd, ['rev-parse', 'HEAD'], containerId)).trim();
    return { sha, message };
  }

  async push(cwd: string, branch?: string, remote = 'origin', containerId?: string, credentials?: { username: string; token: string }): Promise<string> {
    const b = branch ?? (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], containerId)).trim();
    return this.git(cwd, ['push', '-u', remote, b], containerId, credentials);
  }

  async pull(cwd: string, remote = 'origin', branch?: string, containerId?: string, credentials?: { username: string; token: string }): Promise<string> {
    const b = branch ?? (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], containerId)).trim();
    return this.git(cwd, ['pull', remote, b], containerId, credentials);
  }

  async log(cwd: string, maxCount = 10, containerId?: string): Promise<GitLogResult> {
    const output = await this.git(cwd, [
      'log', `--max-count=${maxCount}`,
      '--format=%H|%s|%an|%ad', '--date=short',
    ], containerId);
    const commits = output.trim().split('\n').filter(Boolean).map((line) => {
      const [sha, message, author, date] = line.split('|');
      return { sha: sha ?? '', message: message ?? '', author: author ?? '', date: date ?? '' };
    });
    return { commits };
  }

  async validateRepo(cwd: string, containerId?: string): Promise<boolean> {
    if (containerId) {
      return this.checkRepoInContainer(cwd, containerId);
    }
    const gitDir = resolve(cwd, '.git');
    return existsSync(gitDir) || existsSync(resolve(cwd, 'HEAD'));
  }

  private async checkRepoInContainer(cwd: string, containerId: string): Promise<boolean> {
    try {
      await this.execInContainer(containerId, cwd, 'test', ['-d', '.git']);
      return true;
    } catch {
      try {
        await this.execInContainer(containerId, cwd, 'test', ['-f', 'HEAD']);
        return true;
      } catch {
        return false;
      }
    }
  }

  private buildGitShCommand(args: string[], credentials: { username: string; token: string }): { command: string; args: string[] } {
    const esc = (s: string) => s.replace(/'/g, "'\\''");
    const gitCmd = `git ${args.map(a => `'${esc(a)}'`).join(' ')}`;
    const helper = `git config --global credential.helper "!f() { echo username='${esc(credentials.username)}'; echo password='${esc(credentials.token)}'; }; f"`;
    return { command: 'sh', args: ['-c', `${helper} && ${gitCmd}`] };
  }

  private async git(cwd: string, args: string[], containerId?: string, credentials?: { username: string; token: string }): Promise<string> {
    try {
      if (containerId) {
        if (credentials) {
          const wrapped = this.buildGitShCommand(args, credentials);
          const env = { GIT_USERNAME: credentials.username, GIT_TOKEN: credentials.token };
          return await this.execInContainer(containerId, cwd, wrapped.command, wrapped.args, env);
        }
        return await this.execInContainer(containerId, cwd, 'git', args);
      }
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const e = err as ExecFileException & { stderr?: string };
      const stderr = e.stderr?.toString() ?? '';
      throw new Error(`git ${args.join(' ')} failed: ${e.message}\n${stderr}`);
    }
  }

  private async execInContainer(containerId: string, cwd: string, command: string, args: string[], env?: Record<string, string>): Promise<string> {
    const envArgs = env ? Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : [];
    const dockerArgs = ['exec', '-i', '-w', cwd, ...envArgs, containerId, command, ...args];
    const { stdout } = await execFileAsync('docker', dockerArgs, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  }

  /** Run an arbitrary command inside a container, returning stdout. */
  async exec(containerId: string, cwd: string, command: string, args: string[]): Promise<string> {
    return this.execInContainer(containerId, cwd, command, args);
  }
}
