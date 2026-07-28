import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * Application bootstrap. Configures:
 *  - Pino logger (via nestjs-pino)
 *  - Global ValidationPipe (whitelist, transform, forbidNonWhitelisted)
 *  - Swagger /api/docs
 *  - WebSocket adapter (Socket.IO)
 *  - Graceful shutdown hooks
 */
async function bootstrap(): Promise<void> {
  // Use the default Nest logger during boot so errors are visible immediately,
  // then switch to Pino once the DI container is ready.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    cors: {
      origin: (process.env['MINI_APP_URL'] || process.env['WEBHOOK_DOMAIN']) ? true : false,
      credentials: true,
      exposedHeaders: ['X-Telegram-Init-Data'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
    },
  });

  // Switch to Pino logger now that the container is initialised
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const logger = new NestLogger('Bootstrap');

  // WebSocket adapter for SessionGateway
  app.useWebSocketAdapter(new IoAdapter(app));

  // API prefix excludes Mini App routes (handled separately)
  app.setGlobalPrefix('api', { exclude: ['mini-app', 'mini-app/(.*)'] });

  // Serve Mini App static assets
  app.useStaticAssets(join(__dirname, '..', '..', 'mini-app-assets'), {
    prefix: '/mini-app/assets',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OpenCode Orchestrator API')
    .setDescription('Remote-control OpenCode CLI via Telegram.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Application listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
}

void bootstrap();
