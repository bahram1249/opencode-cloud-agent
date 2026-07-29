import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TelegramSessionHandler } from './handlers/telegram-session.handler';
import { TelegramWorkspaceHandler } from './handlers/telegram-workspace.handler';
import { TelegramProjectHandler } from './handlers/telegram-project.handler';
import { TelegramGitHandler } from './handlers/telegram-git.handler';

import { TelegramAuthGuard } from 'src/common/guards/telegram-auth.guard';
import { NotificationModule } from '../notification/notification.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionModule } from '../session/session.module';
import { StreamModule } from '../stream/stream.module';
import { GitCommandsModule } from '../git-commands/git-commands.module';
import { GitAuthModule } from '../git-auth/git-auth.module';

@Module({
  imports: [
    NotificationModule, WorkspaceModule, SessionModule, StreamModule, GitCommandsModule, GitAuthModule,
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService, TelegramService, TelegramCommandHandler, TelegramAuthGuard,
    TelegramSessionHandler, TelegramWorkspaceHandler, TelegramProjectHandler, TelegramGitHandler,
  ],
  exports: [TelegramService, TelegramBotService],
})
export class TelegramModule {}
