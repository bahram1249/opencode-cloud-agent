import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { CreateRepositoryDto, UpdateRepositoryDto, RepositoryQueryDto } from './dto/repository.dto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Manages repository metadata. Validates that `path` points to a real
 * directory on disk before persistence. Multiple repositories are supported
 * and each carries its own build/test/lint/typecheck commands and approval
 * policy.
 */
@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(dto: CreateRepositoryDto) {
    const absPath = resolve(dto.path);
    if (!existsSync(absPath)) {
      throw new BadRequestException(`Repository path does not exist: ${absPath}`);
    }
    return this.prisma.repository.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        path: absPath,
        branch: dto.branch ?? 'main',
        buildCommand: dto.buildCommand,
        testCommand: dto.testCommand,
        lintCommand: dto.lintCommand,
        typecheckCommand: dto.typecheckCommand,
        installCommand: dto.installCommand,
        approvalPolicy: dto.approvalPolicy ?? 'required',
        remoteUrl: dto.remoteUrl,
      },
    });
  }

  async findAll(query?: RepositoryQueryDto) {
    const where: Record<string, unknown> = {};
    if (query?.enabled !== undefined) where.enabled = query.enabled;
    return this.prisma.repository.findMany({ where, orderBy: { slug: 'asc' } });
  }

  async findBySlug(slug: string) {
    return this.prisma.repository.findUnique({ where: { slug } });
  }

  async findById(id: string) {
    return this.prisma.repository.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    if (dto.path) {
      const absPath = resolve(dto.path);
      if (!existsSync(absPath)) {
        throw new BadRequestException(`Repository path does not exist: ${absPath}`);
      }
      dto.path = absPath;
    }
    return this.prisma.repository.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    return this.prisma.repository.delete({ where: { id } });
  }

  async getOrCreateDefault(slug: string) {
    const existing = await this.findBySlug(slug);
    if (existing) return existing;
    throw new NotFoundException(`Repository "${slug}" not found. Register it via /repos.`);
  }
}
