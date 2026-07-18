import { Controller, Get, Query, Logger } from '@nestjs/common';
import { GitHubAuthService } from './github-auth.service';
import { NotificationService } from 'src/modules/notification/notification.service';

@Controller('auth/github')
export class GitHubAuthController {
  private readonly logger = new Logger(GitHubAuthController.name);

  constructor(
    private readonly githubAuth: GitHubAuthService,
    private readonly notification: NotificationService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<{ message: string }> {
    try {
      const result = await this.githubAuth.handleCallback(code, state);
      let msg = `✅ Logged into GitHub as ${result.login}`;
      if (!result.hasRepoScope) {
        msg += '\n⚠️ Warning: Token missing "repo" scope. Git push operations may fail.';
      }
      await this.notification.sendRaw(result.chatId, msg);
      return { message: `Authenticated as ${result.login}. You can close this window.` };
    } catch (err) {
      this.logger.error(`GitHub OAuth callback failed: ${(err as Error).message}`);
      return { message: 'Authentication failed. Please try again.' };
    }
  }
}
