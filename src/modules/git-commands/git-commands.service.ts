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

  async status(cwd: string): Promise<GitStatusResult> {
    const branch = (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    const status = await this.git(cwd, ['status', '--porcelain']);
    const files = status.split('\n').filter(Boolean);
    const clean = files.length === 0;

    let ahead = 0;
    let behind = 0;
    try {
      const revList = await this.git(cwd, ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`]);
      const parts = revList.trim().split('\t');
      ahead = parseInt(parts[0] ?? '0', 10);
      behind = parseInt(parts[1] ?? '0', 10);
    } catch {
      // no remote tracking
    }

    return { branch, clean, files, ahead, behind };
  }

  async diff(cwd: string, pathspec?: string): Promise<string> {
    const args = ['diff', '--no-color'];
    if (pathspec) args.push('--', pathspec);
    return this.git(cwd, args);
  }

  async diffStaged(cwd: string): Promise<string> {
    return this.git(cwd, ['diff', '--cached', '--no-color']);
  }

  async diffStat(cwd: string): Promise<string> {
    return this.git(cwd, ['diff', '--stat']);
  }

  async add(cwd: string, pathspec?: string): Promise<string> {
    const args = ['add'];
    args.push(pathspec ?? '-A');
    return this.git(cwd, args);
  }

  async commit(cwd: string, message: string): Promise<{ sha: string; message: string }> {
    await this.git(cwd, ['commit', '-m', message]);
    const sha = (await this.git(cwd, ['rev-parse', 'HEAD'])).trim();
    return { sha, message };
  }

  async push(cwd: string, branch?: string, remote = 'origin'): Promise<string> {
    const b = branch ?? (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    return this.git(cwd, ['push', '-u', remote, b]);
  }

  async pull(cwd: string, remote = 'origin', branch?: string): Promise<string> {
    const b = branch ?? (await this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    return this.git(cwd, ['pull', remote, b]);
  }

  async log(cwd: string, maxCount = 10): Promise<GitLogResult> {
    const output = await this.git(cwd, [
      'log', `--max-count=${maxCount}`,
      '--format=%H|%s|%an|%ad', '--date=short',
    ]);
    const commits = output.trim().split('\n').filter(Boolean).map((line) => {
      const [sha, message, author, date] = line.split('|');
      return { sha: sha ?? '', message: message ?? '', author: author ?? '', date: date ?? '' };
    });
    return { commits };
  }

  async createBranch(cwd: string, branchName: string): Promise<string> {
    return this.git(cwd, ['checkout', '-b', branchName]);
  }

  async checkout(cwd: string, branch: string): Promise<string> {
    return this.git(cwd, ['checkout', branch]);
  }

  async merge(cwd: string, branch: string): Promise<string> {
    return this.git(cwd, ['merge', branch]);
  }

  async stash(cwd: string): Promise<string> {
    return this.git(cwd, ['stash']);
  }

  async stashPop(cwd: string): Promise<string> {
    return this.git(cwd, ['stash', 'pop']);
  }

  async remote(cwd: string): Promise<string> {
    return this.git(cwd, ['remote', '-v']);
  }

  async createPR(cwd: string, title: string, head: string, base = 'main'): Promise<string> {
    // Requires `gh` CLI to be installed and authenticated
    try {
      const { stdout } = await execFileAsync('gh', ['pr', 'create', '--title', title, '--head', head, '--base', base, '--fill'], {
        cwd,
        maxBuffer: 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const e = err as ExecFileException;
      throw new Error(`gh pr create failed: ${e.stderr?.toString() ?? e.message}`);
    }
  }

  async listPRs(cwd: string, state = 'open'): Promise<string> {
    try {
      const { stdout } = await execFileAsync('gh', ['pr', 'list', '--state', state], {
        cwd,
        maxBuffer: 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const e = err as ExecFileException;
      throw new Error(`gh pr list failed: ${e.stderr?.toString() ?? e.message}`);
    }
  }

  validateRepo(cwd: string): boolean {
    const gitDir = resolve(cwd, '.git');
    return existsSync(gitDir) || existsSync(resolve(cwd, 'HEAD'));
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const e = err as ExecFileException;
      const stderr = e.stderr?.toString() ?? '';
      throw new Error(`git ${args.join(' ')} failed: ${e.message}\n${stderr}`);
    }
  }
}
