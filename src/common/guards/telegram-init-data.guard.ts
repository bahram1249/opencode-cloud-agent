import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Socket as IoSocket } from 'socket.io';
import { validateAuthToken } from 'src/common/utils/auth-token';

export interface InitDataUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

export interface AuthenticatedRequest {
  initDataUser: InitDataUser;
}

const TOKEN_PREFIX = 'ma_';

@Injectable()
export class TelegramInitDataGuard implements CanActivate {
  private readonly botToken: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('app.botToken', '');
    if (!this.botToken) {
      throw new Error('BOT_TOKEN is required for TelegramInitDataGuard');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    let initData: string | undefined;

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest & IncomingMessage>();
      initData = req.headers['x-telegram-init-data'] as string | undefined;
    } else if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient<IoSocket>();
      initData = client.handshake.query?.initData as string | undefined;
    }

    if (!initData) {
      throw new UnauthorizedException('Missing X-Telegram-Init-Data header');
    }

    const user = this.validateInitData(initData);

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      req.initDataUser = user;
    }

    return true;
  }

  validateInitData(initData: string): InitDataUser {
    if (initData.startsWith(TOKEN_PREFIX)) {
      const userId = validateAuthToken(this.botToken, initData);
      if (!userId) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      return { id: Number(userId), firstName: 'User', lastName: '' };
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      throw new UnauthorizedException('Missing hash in initData');
    }

    params.delete('hash');
    const sorted: string[] = [];
    for (const [key, value] of params.entries()) {
      sorted.push(`${key}=${value}`);
    }
    sorted.sort();
    const dataCheckString = sorted.join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(this.botToken).digest();
    const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) {
      try {
        const hashBuf = Buffer.from(hash, 'hex');
        const computedBuf = Buffer.from(computedHash, 'hex');
        if (hashBuf.length !== computedBuf.length || !timingSafeEqual(hashBuf, computedBuf)) {
          throw new UnauthorizedException('Invalid initData signature');
        }
      } catch {
        throw new UnauthorizedException('Invalid initData signature');
      }
    }

    const userStr = params.get('user');
    if (!userStr) {
      throw new UnauthorizedException('Missing user in initData');
    }

    let userData: { id: number; first_name: string; last_name?: string; username?: string };
    try {
      userData = JSON.parse(userStr) as { id: number; first_name: string; last_name?: string; username?: string };
    } catch {
      throw new UnauthorizedException('Invalid user data in initData');
    }

    return {
      id: userData.id,
      firstName: userData.first_name,
      lastName: userData.last_name,
      username: userData.username,
    };
  }
}
