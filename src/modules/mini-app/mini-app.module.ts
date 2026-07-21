import { Module } from '@nestjs/common';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionModule } from '../session/session.module';
import { MiniAppController } from './mini-app.controller';

@Module({
  imports: [WorkspaceModule, SessionModule],
  controllers: [MiniAppController],
  providers: [TelegramInitDataGuard],
})
export class MiniAppModule {}
