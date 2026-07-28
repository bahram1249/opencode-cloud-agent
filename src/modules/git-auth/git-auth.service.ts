import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitCredentialStatus {
  workspaceId: string;
  workspaceName: string;
  username: string | null;
  tokenMasked: string | null;
  remoteUrl: string | null;
  isSet: boolean;
  lastVerifiedAt: Date | null;
  providerId: string | null;
  providerKeySet: boolean;
  providerKeyMasked: string | null;
}

export interface GitValidationResult {
  valid: boolean;
  refCount: number;
  errorType: 'auth' | 'network' | 'unknown' | null;
  errorMessage: string | null;
}

@Injectable()
export class GitAuthService {
  private readonly logger = new Logger(GitAuthService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  maskToken(token: string): string {
    if (token.length <= 4) return '****';
    if (token.length < 8) return token.slice(0, 4) + '****';
    return token.slice(0, 4) + '****' + token.slice(-4);
  }

  async validateToken(
    remoteUrl: string,
    username: string,
    token: string,
    containerId?: string,
  ): Promise<GitValidationResult> {
    const authUrl = remoteUrl.replace(
      /^https?:\/\//,
      `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`,
    );

    try {
      if (containerId) {
        const { stdout } = await execFileAsync('docker', [
          'exec', containerId, 'git', 'ls-remote', authUrl,
        ], { maxBuffer: 1024 * 1024, timeout: 30000 });
        const refs = stdout.trim().split('\n').filter(Boolean);
        return { valid: true, refCount: refs.length, errorType: null, errorMessage: null };
      }

      const { stdout } = await execFileAsync('git', ['ls-remote', authUrl], {
        maxBuffer: 1024 * 1024,
        timeout: 30000,
      });
      const refs = stdout.trim().split('\n').filter(Boolean);
      return { valid: true, refCount: refs.length, errorType: null, errorMessage: null };
    } catch (err) {
      const message = (err as Error).message;
      const stderr = (err as { stderr?: string }).stderr ?? '';

      if (stderr.includes('401') || stderr.includes('403') || stderr.includes('Authentication failed') || stderr.includes('access denied') || stderr.includes('not permitted')) {
        return { valid: false, refCount: 0, errorType: 'auth', errorMessage: 'Authentication failed. Check your token and username.' };
      }
      if (stderr.includes('Could not resolve host') || stderr.includes('Connection refused') || stderr.includes('Name or service not known') || stderr.includes('network')) {
        return { valid: false, refCount: 0, errorType: 'network', errorMessage: 'Could not reach the remote repository. Check the URL and your network connection.' };
      }
      if (stderr.includes('Repository not found') || stderr.includes('not found') || stderr.includes('404')) {
        return { valid: false, refCount: 0, errorType: 'auth', errorMessage: 'Repository not found. Check the remote URL.' };
      }
      return { valid: false, refCount: 0, errorType: 'unknown', errorMessage: message.slice(0, 200) };
    }
  }

  async setWorkspaceCredentials(
    workspaceId: string,
    username: string,
    token: string,
  ): Promise<{ username: string; tokenMasked: string }> {
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { gitToken: token, gitUsername: username },
    });
    return { username, tokenMasked: this.maskToken(token) };
  }

  async removeCredentials(workspaceId: string): Promise<void> {
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { gitToken: null, gitUsername: null },
    });
  }

  async getCredentialsStatus(workspaceId: string): Promise<GitCredentialStatus> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        gitToken: true,
        gitUsername: true,
        apiKey: true,
        providerId: true,
        projects: { select: { remoteUrl: true }, take: 1 },
      },
    });

    if (!ws) {
      return {
        workspaceId, workspaceName: 'Unknown', username: null, tokenMasked: null,
        remoteUrl: null, isSet: false, lastVerifiedAt: null,
        providerId: null, providerKeySet: false, providerKeyMasked: null,
      };
    }

    return {
      workspaceId,
      workspaceName: ws.name,
      username: ws.gitUsername,
      tokenMasked: ws.gitToken ? this.maskToken(ws.gitToken) : null,
      remoteUrl: ws.projects[0]?.remoteUrl ?? null,
      isSet: !!ws.gitToken && !!ws.gitUsername,
      lastVerifiedAt: null,
      providerId: ws.providerId ?? null,
      providerKeySet: !!ws.apiKey,
      providerKeyMasked: ws.apiKey ? this.maskToken(ws.apiKey) : null,
    };
  }

  isGitAuthError(errorMessage: string): boolean {
    const lower = errorMessage.toLowerCase();
    return lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('authentication failed') ||
      lower.includes('access denied') ||
      lower.includes('not permitted') ||
      lower.includes('could not read from remote') ||
      lower.includes('required authentication') ||
      lower.includes('token expired') ||
      lower.includes('invalid token');
  }

  async testCredentials(
    workspaceId: string,
    containerId?: string,
  ): Promise<GitValidationResult> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { gitToken: true, gitUsername: true, projects: { select: { remoteUrl: true }, take: 1 } },
    });

    if (!ws?.gitToken || !ws?.gitUsername) {
      return { valid: false, refCount: 0, errorType: 'auth', errorMessage: 'No credentials configured.' };
    }

    const remoteUrl = ws.projects[0]?.remoteUrl;
    if (!remoteUrl) {
      return { valid: false, refCount: 0, errorType: 'unknown', errorMessage: 'No remote URL configured on any project. Add a project with a remote URL first.' };
    }

    return this.validateToken(remoteUrl, ws.gitUsername, ws.gitToken, containerId);
  }
}
