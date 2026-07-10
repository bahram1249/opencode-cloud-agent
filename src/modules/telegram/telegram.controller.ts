import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Update } from 'telegraf/types';
import { TelegramService } from './telegram.service';

/**
 * Receives Telegram webhook updates. Telegram POSTs to this endpoint
 * when WEBHOOK_DOMAIN is configured. The service routes the update to
 * the Telegraf bot.
 */
@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: Update): Promise<{ ok: true }> {
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
