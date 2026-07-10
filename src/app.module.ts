import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { appConfig } from './config/app.config';
import { validateEnvironment } from './config/environment.validation';
import { LoggerModule } from './common/logger.module';
import { PrismaModule } from './database/prisma.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HealthModule } from './modules/health/health.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { TaskModule } from './modules/task/task.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { OpenCodeModule } from './modules/opencode/opencode.module';
import { GitModule } from './modules/git/git.module';
import { BuildModule } from './modules/build/build.module';
import { NotificationModule } from './modules/notification/notification.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { PromptTemplateModule } from './modules/prompt-template/prompt-template.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { SessionModule } from './modules/session/session.module';
import { StreamModule } from './modules/stream/stream.module';
import { GitCommandsModule } from './modules/git-commands/git-commands.module';
import { QueueModule } from './queues/queue.module';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig],
      validate: validateEnvironment,
      envFilePath: ['.env', '.env.local'],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      maxListeners: 20,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('app.redisUrl', 'redis://localhost:6379') },
      }),
    }),

    // ── Infrastructure ─────────────────────────────────────────────
    LoggerModule,
    PrismaModule,
    QueueModule,

    // ── Domain modules ─────────────────────────────────────────────
    HealthModule,
    RepositoryModule,
    ConfigurationModule,
    PromptTemplateModule,
    TaskModule,
    WorkflowModule,
    OpenCodeModule,
    GitModule,
    BuildModule,
    NotificationModule,
    TelegramModule,

    // ── New modules (workspace, sessions, streaming, git commands) ──
    WorkspaceModule,
    SessionModule,
    StreamModule,
    GitCommandsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
