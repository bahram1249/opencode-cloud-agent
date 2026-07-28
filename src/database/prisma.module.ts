import { Global, Module, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, isEncryptionEnabled } from 'src/common/utils/encryption';

const ENCRYPTED_FIELDS = ['gitToken', 'apiKey'] as const;

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

    if (isEncryptionEnabled()) {
      Logger.log('Encryption enabled for gitToken and apiKey fields', 'PrismaService');
    } else {
      Logger.warn('ENCRYPTION_KEY not set — sensitive fields stored in plaintext. Set ENCRYPTION_KEY in production.', 'PrismaService');
    }

    this.$use(async (params, next) => {
      if (params.model !== 'Workspace') return next(params);

      if (params.action === 'create' || params.action === 'update') {
        for (const field of ENCRYPTED_FIELDS) {
          if (params.args.data?.[field]) {
            params.args.data[field] = encrypt(params.args.data[field]);
          }
        }
      }

      if (params.action === 'findUnique' || params.action === 'findFirst' || params.action === 'findMany') {
        const result = await next(params);
        if (!result) return result;
        const decryptRecords = (records: unknown[]) => {
          for (const record of records) {
            if (record && typeof record === 'object') {
              for (const field of ENCRYPTED_FIELDS) {
                const val = (record as Record<string, unknown>)[field];
                if (typeof val === 'string') {
                  (record as Record<string, unknown>)[field] = decrypt(val);
                }
              }
            }
          }
        };
        if (Array.isArray(result)) {
          decryptRecords(result);
        } else {
          decryptRecords([result]);
        }
        return result;
      }

      return next(params);
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
