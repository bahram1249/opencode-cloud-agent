import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Application bootstrap. Configures:
 *  - Pino logger (via nestjs-pino)
 *  - Global ValidationPipe (whitelist, transform, forbidNonWhitelisted)
 *  - Swagger /api/docs
 *  - Graceful shutdown hooks
 */
async function bootstrap(): Promise<void> {
  // Use the default Nest logger during boot so errors are visible immediately,
  // then switch to Pino once the DI container is ready.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    cors: true,
  });

  // Switch to Pino logger now that the container is initialised
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const logger = new NestLogger('Bootstrap');

  app.setGlobalPrefix('api');
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
