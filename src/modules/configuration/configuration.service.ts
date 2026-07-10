import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { CreateConfigurationDto, UpdateConfigurationDto } from './dto/configuration.dto';

@Injectable()
export class ConfigurationService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(dto: CreateConfigurationDto) {
    return this.prisma.configuration.create({
      data: {
        key: dto.key,
        value: dto.value,
        scope: dto.scope ?? 'global',
        repositoryId: dto.repositoryId ?? null,
      },
    });
  }

  async findAll(scope?: string) {
    return this.prisma.configuration.findMany({
      where: scope ? { scope } : undefined,
      orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string) {
    return this.prisma.configuration.findUnique({ where: { key } });
  }

  async update(key: string, dto: UpdateConfigurationDto) {
    return this.prisma.configuration.update({ where: { key }, data: dto });
  }

  async remove(key: string) {
    return this.prisma.configuration.delete({ where: { key } });
  }

  /** Get a configuration value, falling back to a default if missing. */
  async getValue(key: string, fallback: string): Promise<string> {
    const row = await this.findByKey(key);
    return row?.value ?? fallback;
  }
}
