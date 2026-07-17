import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, resolve, join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { DockerWorkspaceService } from './docker-workspace.service';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, CreateProjectDto, UpdateProjectDto } from './dto/workspace.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly git: GitCommandsService,
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
    const absPath = dto.workDir ? resolve(dto.workDir) : join(this.config.get<string>('app.workspaceRoot', '/workspace'), telegramUserId, dto.name);
    mkdirSync(absPath, { recursive: true });
    if (!statSync(absPath).isDirectory()) throw new BadRequestException(`Path is not a directory: ${absPath}`);

    const existing = await this.prisma.workspace.findUnique({ where: { tenantId_name: { tenantId: tenant.id, name: dto.name } } });
    if (existing) throw new BadRequestException(`Workspace "${dto.name}" already exists`);

    const ws = await this.prisma.workspace.create({
      data: { tenantId: tenant.id, name: dto.name, workDir: absPath, providerId: dto.providerId, model: dto.model },
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
    return this.prisma.workspace.findFirst({ where: { id, ...(tenant ? { tenantId: tenant.id } : {}) }, include: { projects: true, tenant: true } });
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
    if (dto.workDir) { const absPath = resolve(dto.workDir); mkdirSync(absPath, { recursive: true }); data.workDir = absPath; }
    if (dto.providerId !== undefined) data.providerId = dto.providerId;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.active === true) await this.prisma.workspace.updateMany({ where: { tenantId: ws.tenantId, active: true }, data: { active: false } });
    if (dto.active !== undefined) data.active = dto.active;
    const updated = await this.prisma.workspace.update({ where: { id }, data, include: { projects: true, tenant: true } });
    const containerId = await this.dockerWorkspaces.ensureContainer({ workspaceId: updated.id, tenantId: updated.tenantId, workDir: updated.workDir, providerId: updated.providerId, apiKey: dto.apiKey, model: updated.model });
    if (containerId && containerId !== updated.containerId) return this.prisma.workspace.update({ where: { id }, data: { containerId }, include: { projects: true, tenant: true } });
    return updated;
  }

  async remove(id: string, telegramUserId = 'legacy') {
    const ws = await this.findById(id, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);
    await this.dockerWorkspaces.removeContainer(ws.containerId);
    return this.prisma.workspace.delete({ where: { id } });
  }

  async addProject(workspaceId: string, dto: CreateProjectDto, telegramUserId = 'legacy') {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    let absPath = resolve(ws.workDir, dto.gitPath === '.' ? '.' : dto.gitPath);
    if (dto.remoteUrl && !existsSync(absPath)) {
      await this.git.clone(ws.workDir, dto.remoteUrl, dto.gitPath === '.' ? '.' : dto.gitPath);
    }
    absPath = resolve(absPath);
    if (!existsSync(absPath)) throw new BadRequestException(`Path does not exist: ${absPath}`);
    if (!this.git.validateRepo(absPath)) throw new BadRequestException(`Not a git repository: ${absPath}. The folder must have a .git directory.`);
    return this.prisma.workspaceProject.create({ data: { workspaceId, name: dto.name || basename(absPath), gitPath: absPath, branch: dto.branch ?? 'main', remoteUrl: dto.remoteUrl, provider: dto.provider } });
  }

  async updateProject(projectId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.gitPath) { const absPath = resolve(dto.gitPath); if (!existsSync(absPath)) throw new BadRequestException(`Git path does not exist: ${absPath}`); data.gitPath = absPath; }
    if (dto.branch) data.branch = dto.branch;
    if (dto.remoteUrl !== undefined) data.remoteUrl = dto.remoteUrl;
    if (dto.provider !== undefined) data.provider = dto.provider;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.workspaceProject.update({ where: { id: projectId }, data });
  }

  async configureProvider(workspaceId: string, telegramUserId: string, providerId: string, apiKey: string) {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId,
      apiKey,
      model: ws.model,
    });
    return this.prisma.workspace.update({
      where: { id: ws.id },
      data: { providerId, ...(containerId ? { containerId } : {}) },
      include: { projects: true, tenant: true },
    });
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
    await this.dockerWorkspaces.ensureContainer({
      workspaceId: updated.id,
      tenantId: updated.tenantId,
      workDir: updated.workDir,
      providerId: updated.providerId,
      model: updated.model,
    });
    return updated;
  }

  async listOpenCodeModels(workspaceId: string, telegramUserId: string, providerId?: string): Promise<string[]> {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const args = ['models', '--refresh', ...(providerId ? [providerId] : [])];
    const command = ws.containerId ? 'docker' : 'opencode';
    const commandArgs = ws.containerId
      ? this.dockerWorkspaces.dockerExecNonInteractiveArgs(ws.containerId, ws.workDir, 'opencode', args)
      : args;
    const { stdout } = await execFileAsync(command, commandArgs, { cwd: ws.workDir, maxBuffer: 10 * 1024 * 1024 });
    const models = new Set<string>();
    for (const match of stdout.matchAll(/([a-z0-9][a-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.:-]*)/g)) {
      models.add(match[1]);
    }
    return [...models].sort();
  }

  async syncProjects(workspaceId: string, telegramUserId = 'legacy'): Promise<Array<{ name: string; action: string; ok: boolean; message: string }>> {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId: ws.providerId,
      model: ws.model,
    });

    const projects = await this.prisma.workspaceProject.findMany({ where: { workspaceId, enabled: true }, orderBy: { name: 'asc' } });
    const results: Array<{ name: string; action: string; ok: boolean; message: string }> = [];
    for (const project of projects) {
      try {
        if (!existsSync(project.gitPath)) {
          if (!project.remoteUrl) {
            results.push({ name: project.name, action: 'skip', ok: false, message: 'missing path and no remote URL configured' });
            continue;
          }
          const target = project.gitPath === ws.workDir ? '.' : project.gitPath.replace(`${ws.workDir}/`, '');
          await this.git.clone(ws.workDir, project.remoteUrl, target);
          results.push({ name: project.name, action: 'clone', ok: true, message: project.remoteUrl });
          continue;
        }

        if (!this.git.validateRepo(project.gitPath)) {
          results.push({ name: project.name, action: 'skip', ok: false, message: 'path exists but is not a git repository' });
          continue;
        }

        const status = await this.git.status(project.gitPath);
        if (!status.clean) {
          results.push({ name: project.name, action: 'skip', ok: true, message: 'local changes present; skipped automatic pull' });
          continue;
        }
        const output = await this.git.pull(project.gitPath, 'origin', project.branch);
        results.push({ name: project.name, action: 'pull', ok: true, message: output.trim() || 'already up to date' });
      } catch (err) {
        results.push({ name: project.name, action: 'error', ok: false, message: (err as Error).message });
      }
    }
    return results;
  }

  async findProjectById(projectId: string) { return this.prisma.workspaceProject.findUnique({ where: { id: projectId } }); }
  async removeProject(projectId: string) { const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId } }); if (!project) throw new NotFoundException(`Project ${projectId} not found`); return this.prisma.workspaceProject.delete({ where: { id: projectId } }); }
  async getProjects(workspaceId: string) { return this.prisma.workspaceProject.findMany({ where: { workspaceId, enabled: true }, orderBy: { name: 'asc' } }); }
}
