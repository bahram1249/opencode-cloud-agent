import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TelegramAuthGuard } from 'src/common/guards/telegram-auth.guard';
import { NotificationModule } from '../notification/notification.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionModule } from '../session/session.module';
import { StreamModule } from '../stream/stream.module';
import { GitCommandsModule } from '../git-commands/git-commands.module';

@Module({
  imports: [
    NotificationModule, WorkspaceModule, SessionModule, StreamModule, GitCommandsModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramBotService, TelegramService, TelegramCommandHandler, TelegramAuthGuard],
  exports: [TelegramService, TelegramBotService],
})
export class TelegramModule {}
