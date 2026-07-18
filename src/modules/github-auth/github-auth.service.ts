import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import axios from 'axios';
import { randomBytes } from 'node:crypto';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUserResponse {
  login: string;
  avatar_url: string;
  name: string | null;
}

@Injectable()
export class GitHubAuthService {
  private readonly logger = new Logger(GitHubAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateStore = new Map<string, { telegramUserId: string; chatId: string; workspaceId?: string; expiresAt: number }>();

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('app.githubClientId', '');
    this.clientSecret = this.config.get<string>('app.githubClientSecret', '');
    const webhookDomain = this.config.get<string>('app.webhookDomain', '');
    this.redirectUri = webhookDomain
      ? `${webhookDomain}/api/auth/github/callback`
      : 'http://localhost:3000/api/auth/github/callback';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  generateAuthUrl(telegramUserId: string, chatId: string, workspaceId?: string): string {
    const state = randomBytes(16).toString('hex');
    this.stateStore.set(state, {
      telegramUserId,
      chatId,
      workspaceId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'repo,user',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ telegramUserId: string; chatId: string; login: string; hasRepoScope: boolean }> {
    const stored = this.stateStore.get(state);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }
    this.stateStore.delete(state);

    const tokenResponse = await this.exchangeCode(code);
    const scopes = tokenResponse.scope.split(',').map(s => s.trim());
    const hasRepoScope = scopes.includes('repo');
    if (!hasRepoScope) {
      this.logger.warn(`GitHub token missing 'repo' scope (got: ${tokenResponse.scope})`);
    }

    const user = await this.fetchGitHubUser(tokenResponse.access_token);

    if (stored.workspaceId) {
      // Store token on the workspace
      await this.prisma.workspace.update({
        where: { id: stored.workspaceId },
        data: {
          githubToken: tokenResponse.access_token,
          githubLogin: user.login,
        },
      });
    } else {
      // Fallback: store on tenant (global)
      await this.prisma.tenant.upsert({
        where: { telegramUserId: stored.telegramUserId },
        update: {
          githubToken: tokenResponse.access_token,
          githubLogin: user.login,
          githubAvatar: user.avatar_url,
        },
        create: {
          telegramUserId: stored.telegramUserId,
          githubToken: tokenResponse.access_token,
          githubLogin: user.login,
          githubAvatar: user.avatar_url,
        },
      });
    }

    return {
      telegramUserId: stored.telegramUserId,
      chatId: stored.chatId,
      login: user.login,
      hasRepoScope,
    };
  }

  async revokeToken(telegramUserId: string): Promise<void> {
    const token = await this.prisma.tenant.findUnique({
      where: { telegramUserId },
      select: { githubToken: true },
    });
    if (token?.githubToken) {
      try {
        await axios.delete(`https://api.github.com/applications/${this.clientId}/token`, {
          auth: { username: this.clientId, password: this.clientSecret },
          data: { access_token: token.githubToken },
        });
      } catch (err) {
        this.logger.warn(`GitHub token revocation failed: ${(err as Error).message}`);
      }
    }
    await this.prisma.tenant.update({
      where: { telegramUserId },
      data: { githubToken: null, githubLogin: null, githubAvatar: null },
    });
  }

  private async exchangeCode(code: string): Promise<GitHubTokenResponse> {
    const { data } = await axios.post<GitHubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      },
      { headers: { Accept: 'application/json' } },
    );
    return data;
  }

  private async fetchGitHubUser(token: string): Promise<GitHubUserResponse> {
    const { data } = await axios.get<GitHubUserResponse>('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }
}
