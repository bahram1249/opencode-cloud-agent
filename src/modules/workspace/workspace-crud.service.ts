import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { DockerWorkspaceService } from './docker-workspace.service';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';

@Injectable()
export class WorkspaceCrudService {
  private readonly logger = new Logger(WorkspaceCrudService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly dockerWorkspaces: DockerWorkspaceService,
    private readonly config: ConfigService,
  ) {}

  async ensureTenant(telegramUserId: string, displayName?: string) {
    return this.prisma.tenant.upsert({
      where: { telegramUserId },
      update: displayName ? { displayName } : {},
      create: { telegramUserId, displayName },
    });
  }

  async create(dto: CreateWorkspaceDto, telegramUserId = 'legacy') {
    const tenant = await this.ensureTenant(telegramUserId);
    const wsId = randomUUID();
    const workspaceRoot = this.config.get<string>('app.workspaceRoot', '/data/workspaces');
    const absPath = resolve(join(workspaceRoot, tenant.id, wsId));
    mkdirSync(absPath, { recursive: true });
    if (!statSync(absPath).isDirectory()) throw new BadRequestException(`Path is not a directory: ${absPath}`);

    const existing = await this.prisma.workspace.findUnique({ where: { tenantId_name: { tenantId: tenant.id, name: dto.name } } });
    if (existing) throw new BadRequestException(`Workspace "${dto.name}" already exists`);

    const ws = await this.prisma.workspace.create({
      data: { id: wsId, tenantId: tenant.id, name: dto.name, workDir: absPath, providerId: dto.providerId, apiKey: dto.apiKey, model: dto.model },
      include: { projects: true, tenant: true },
    });
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id, tenantId: tenant.id, workDir: absPath, providerId: dto.providerId, apiKey: dto.apiKey, model: dto.model,
    });
    if (containerId) return this.prisma.workspace.update({ where: { id: ws.id }, data: { containerId }, include: { projects: true, tenant: true } });
    return ws;
  }

  async findAll(telegramUserId?: string) {
    const tenant = telegramUserId ? await this.ensureTenant(telegramUserId) : null;
    return this.prisma.workspace.findMany({
      where: tenant ? { tenantId: tenant.id } : undefined,
      orderBy: { name: 'asc' },
      include: { projects: true, tenant: true, _count: { select: { sessions: true } } },
    });
  }

  async findById(id: string, telegramUserId?: string) {
    const tenant = telegramUserId ? await this.ensureTenant(telegramUserId) : null;
    return this.prisma.workspace.findFirst({
      where: { id, ...(tenant ? { tenantId: tenant.id } : {}) },
      include: { projects: true, tenant: true, _count: { select: { sessions: true } } },
    });
  }

  async findByName(name: string, telegramUserId?: string) {
    const tenant = telegramUserId ? await this.ensureTenant(telegramUserId) : null;
    return this.prisma.workspace.findFirst({ where: { name, ...(tenant ? { tenantId: tenant.id } : {}) }, include: { projects: true, tenant: true } });
  }

  async getActive(telegramUserId = 'legacy') {
    const tenant = await this.ensureTenant(telegramUserId);
    return this.prisma.workspace.findFirst({ where: { tenantId: tenant.id, active: true }, include: { projects: true, tenant: true } });
  }

  async setActive(id: string, telegramUserId = 'legacy') {
    const ws = await this.findById(id, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);
    await this.prisma.workspace.updateMany({ where: { tenantId: ws.tenantId, active: true }, data: { active: false } });
    await this.prisma.workspace.update({ where: { id }, data: { active: true } });
    return this.findById(id, telegramUserId);
  }

  async update(id: string, dto: UpdateWorkspaceDto, telegramUserId = 'legacy') {
    const ws = await this.findById(id, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);
    const data: Record<string, unknown> = {};

    if (dto.name) data.name = dto.name;
    if (dto.providerId !== undefined) data.providerId = dto.providerId;
    if (dto.apiKey !== undefined) data.apiKey = dto.apiKey;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.active === true) await this.prisma.workspace.updateMany({ where: { tenantId: ws.tenantId, active: true }, data: { active: false } });
    if (dto.active !== undefined) data.active = dto.active;
    const updated = await this.prisma.workspace.update({ where: { id }, data, include: { projects: true, tenant: true } });

    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: updated.id, tenantId: updated.tenantId, workDir: updated.workDir,
      providerId: updated.providerId, apiKey: updated.apiKey, model: updated.model,
    });
    if (containerId && containerId !== updated.containerId) {
      await this.prisma.workspace.update({ where: { id }, data: { containerId }, include: { projects: true, tenant: true } });
    }
    return this.findById(id, telegramUserId);
  }

  async remove(id: string, telegramUserId = 'legacy') {
    const ws = await this.findById(id, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);
    await this.dockerWorkspaces.removeContainer(ws.containerId);
    return this.prisma.workspace.delete({ where: { id } });
  }

  async configureProvider(workspaceId: string, telegramUserId: string, providerId: string, apiKey: string) {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    await this.prisma.workspace.update({
      where: { id: ws.id },
      data: { providerId, apiKey },
    });
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id, tenantId: ws.tenantId, workDir: ws.workDir,
      providerId, apiKey, model: ws.model,
    });
    const result = await this.prisma.workspace.update({
      where: { id: ws.id },
      data: { providerId, apiKey, ...(containerId ? { containerId } : {}) },
      include: { projects: true, tenant: true },
    });
    return result;
  }

  async setDefaultModel(workspaceId: string, telegramUserId: string, model: string) {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const providerId = model.split('/')[0] || ws.providerId;
    const updated = await this.prisma.workspace.update({
      where: { id: ws.id },
      data: { model, providerId },
      include: { projects: true, tenant: true },
    });
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: updated.id, tenantId: updated.tenantId, workDir: updated.workDir,
      providerId: updated.providerId, apiKey: updated.apiKey, model: updated.model,
    });
    if (containerId) {
      await this.prisma.workspace.update({ where: { id: ws.id }, data: { containerId } }).catch(() => {});
    }
    return updated;
  }

  async getWorkspaceCredentials(workspaceId: string): Promise<{ apiKey: string | null; gitToken: string | null; gitUsername: string | null }> {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) return { apiKey: null, gitToken: null, gitUsername: null };
    return { apiKey: ws.apiKey ?? null, gitToken: ws.gitToken ?? null, gitUsername: ws.gitUsername ?? null };
  }
}
