import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

/**
 * Extracts the authenticated Telegram user id from the request context.
 * Set by `TelegramAuthGuard`.
 */
export const CurrentTelegramUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | undefined => {
    const req = ctx.switchToHttp().getRequest<{ telegramUserId?: number }>();
    return req.telegramUserId;
  },
);
