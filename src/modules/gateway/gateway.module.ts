import { Module } from '@nestjs/common';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { SessionModule } from '../session/session.module';
import { SessionGateway } from './session.gateway';

@Module({
  imports: [SessionModule],
  providers: [SessionGateway, TelegramInitDataGuard],
})
export class GatewayModule {}
