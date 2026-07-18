import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { appConfig } from './config/app.config';
import { validateEnvironment } from './config/environment.validation';
import { LoggerModule } from './common/logger.module';
import { PrismaModule } from './database/prisma.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HealthModule } from './modules/health/health.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { SessionModule } from './modules/session/session.module';
import { StreamModule } from './modules/stream/stream.module';
import { GitCommandsModule } from './modules/git-commands/git-commands.module';
import { GitAuthModule } from './modules/git-auth/git-auth.module';

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

    // ── Infrastructure ─────────────────────────────────────────────
    LoggerModule,
    PrismaModule,

    // ── Domain modules ─────────────────────────────────────────────
    HealthModule,
    NotificationModule,
    TelegramModule,
    WorkspaceModule,
    SessionModule,
    StreamModule,
    GitCommandsModule,
    GitAuthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
