import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TelegramAuthGuard } from 'src/common/guards/telegram-auth.guard';
import { TaskModule } from '../task/task.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RepositoryModule } from '../repository/repository.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TaskModule, WorkflowModule, RepositoryModule, NotificationModule],
  controllers: [TelegramController],
  providers: [TelegramBotService, TelegramService, TelegramCommandHandler, TelegramAuthGuard],
  exports: [TelegramService, TelegramBotService],
})
export class TelegramModule {}
