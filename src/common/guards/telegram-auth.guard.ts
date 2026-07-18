import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'src/config/app.config';

/**
 * Guards Telegram updates: only user IDs in AUTHORIZED_USERS may interact
 * with the bot. Applied per-command and globally on the update handler.
 */
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const tg = context.switchToRpc().getContext<{ from?: { id: number } }>();
    const fromId = tg.from?.id;
    if (!fromId) {
      throw new UnauthorizedException('Unidentifiable Telegram user');
    }
    const appConfig = this.config.get<Partial<AppConfig>>('app');
    const allowed = appConfig?.authorizedUsers;
    // If no authorized users configured, allow everyone
    if (!allowed || allowed.size === 0) {
      return true;
    }
    if (!allowed.has(fromId)) {
      throw new UnauthorizedException(`Telegram user ${fromId} is not authorized`);
    }
    return true;
  }
}
