import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around PrismaClient exposed as an injectable provider so the
 * rest of the app depends on a DI token instead of a concrete client.
 */
export const PRISMA_CLIENT = 'PRISMA_CLIENT';

export class PrismaService extends PrismaClient {
  constructor() {
    super({
      log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
