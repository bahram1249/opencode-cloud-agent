import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
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
    const creds = await this.getWorkspaceCredentials(ws.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id, tenantId: tenant.id, workDir: absPath, providerId: dto.providerId, apiKey: creds.apiKey, model: dto.model,
      gitToken: creds.gitToken, gitUsername: creds.gitUsername,
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

    if (dto.name) {
      data.name = dto.name;
    }
    if (dto.providerId !== undefined) data.providerId = dto.providerId;
    if (dto.apiKey !== undefined) data.apiKey = dto.apiKey;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.active === true) await this.prisma.workspace.updateMany({ where: { tenantId: ws.tenantId, active: true }, data: { active: false } });
    if (dto.active !== undefined) data.active = dto.active;
    const updated = await this.prisma.workspace.update({ where: { id }, data, include: { projects: true, tenant: true } });

    const creds = await this.getWorkspaceCredentials(updated.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({ workspaceId: updated.id, tenantId: updated.tenantId, workDir: updated.workDir, providerId: updated.providerId, apiKey: creds.apiKey, model: updated.model, gitToken: creds.gitToken, gitUsername: creds.gitUsername });
    if (containerId && containerId !== updated.containerId) {
      await this.prisma.workspace.update({ where: { id }, data: { containerId }, include: { projects: true, tenant: true } });
    }
    // Sync projects after container ensure to pull latest on start
    if (containerId) {
      await this.syncProjects(id, telegramUserId).catch((err) =>
        { this.logger.warn(`Background sync after update failed: ${(err as Error).message}`); },
      );
    }
    return this.findById(id, telegramUserId);
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
    const containerId = ws.containerId ?? undefined;
    const relPath = dto.path || '.';
    const absPath = relPath === '.' ? ws.workDir : resolve(ws.workDir, relPath);
    const containerWorkDir = containerId ? this.dockerWorkspaces.toContainerPath(ws.workDir, ws.workDir) : ws.workDir;
    const containerPath = containerId
      ? this.dockerWorkspaces.toContainerPath(absPath, ws.workDir)
      : absPath;

    let didClone = false;
    if (dto.remoteUrl && !(containerId ? await this.execPathExists(containerId, containerPath) : existsSync(containerPath))) {
      const target = containerPath === containerWorkDir ? '.' : relPath;
      const creds = await this.getWorkspaceCredentials(workspaceId);
      const gitCreds = creds.gitToken && creds.gitUsername ? { username: creds.gitUsername, token: creds.gitToken } : undefined;
      await this.git.clone(containerWorkDir, dto.remoteUrl, target, containerId, gitCreds);
      didClone = true;
    }
    if (!(containerId ? await this.execPathExists(containerId, containerPath) : existsSync(containerPath))) {
      throw new BadRequestException(`Path does not exist: ${containerPath}`);
    }
    if (!(await this.git.validateRepo(containerPath, containerId))) throw new BadRequestException(`Not a git repository at "${relPath}". The folder must have a .git directory.`);
    const project = await this.prisma.workspaceProject.create({
      data: {
        workspaceId,
        name: dto.name || basename(relPath === '.' ? ws.name : relPath),
        gitPath: absPath,
        path: relPath,
        remoteUrl: dto.remoteUrl,
        provider: dto.provider,
      },
    });
    // Auto-install dependencies after clone if enabled
    if (didClone && project.autoInstall && containerId) {
      try {
        const installResult = await this.installProjectDependencies(project.id);
        this.logger.log(`Auto-install for ${project.name}: ${installResult}`);
      } catch (err) {
        this.logger.warn(`Auto-install failed for ${project.name}: ${(err as Error).message}`);
      }
    }
    return project;
  }

  async updateProject(projectId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId }, include: { workspace: true } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.path) {
      data.path = dto.path;
      const absPath = dto.path === '.' ? project.workspace.workDir : resolve(project.workspace.workDir, dto.path);
      data.gitPath = absPath;
    }
    if (dto.branch) data.branch = dto.branch;
    if (dto.remoteUrl !== undefined) data.remoteUrl = dto.remoteUrl;
    if (dto.autoInstall !== undefined) data.autoInstall = dto.autoInstall;
    if (dto.installCommand !== undefined) data.installCommand = dto.installCommand;
    if (dto.provider !== undefined) data.provider = dto.provider;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.workspaceProject.update({ where: { id: projectId }, data });
  }

  async configureProvider(workspaceId: string, telegramUserId: string, providerId: string, apiKey: string) {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    await this.prisma.workspace.update({
      where: { id: ws.id },
      data: { providerId, apiKey },
    });
    const creds = await this.getWorkspaceCredentials(ws.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId,
      apiKey: creds.apiKey,
      model: ws.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    const result = await this.prisma.workspace.update({
      where: { id: ws.id },
      data: { providerId, apiKey, ...(containerId ? { containerId } : {}) },
      include: { projects: true, tenant: true },
    });
    if (containerId) {
      await this.syncProjects(workspaceId, telegramUserId).catch((err) =>
        { this.logger.warn(`Background sync after configureProvider failed: ${(err as Error).message}`); },
      );
    }
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
    const creds = await this.getWorkspaceCredentials(updated.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: updated.id,
      tenantId: updated.tenantId,
      workDir: updated.workDir,
      providerId: updated.providerId,
      apiKey: creds.apiKey,
      model: updated.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    if (containerId) {
      await this.syncProjects(workspaceId, telegramUserId).catch((err) =>
        { this.logger.warn(`Background sync after setDefaultModel failed: ${(err as Error).message}`); },
      );
    }
    return updated;
  }

  async listOpenCodeModels(workspaceId: string, telegramUserId: string, providerId?: string): Promise<string[]> {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);

    // Ensure container is running before listing models
    const creds = await this.getWorkspaceCredentials(ws.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId: ws.providerId,
      apiKey: creds.apiKey,
      model: ws.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    if (!containerId) {
      throw new BadRequestException('Docker container not available. Start Docker and ensure WORKSPACE_CONTAINERS_ENABLED is true.');
    }
    const execEnv = this.dockerWorkspaces.buildProviderEnv({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId: ws.providerId,
      apiKey: creds.apiKey,
      model: ws.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });
    const dockerArgs = this.dockerWorkspaces.dockerExecNonInteractiveArgs(containerId, ws.workDir, 'opencode', ['models'], execEnv);
    const { stdout } = await execFileAsync('docker', dockerArgs, {
      cwd: ws.workDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    const models = new Set<string>();
    for (const match of stdout.matchAll(/([a-z0-9][a-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.:-]*)/g)) {
      const model = match[1];
      if (!providerId || model.startsWith(`${providerId}/`)) {
        models.add(model);
      }
    }
    return [...models].sort();
  }

  async syncProjects(workspaceId: string, telegramUserId = 'legacy'): Promise<Array<{ name: string; action: string; ok: boolean; message: string }>> {
    const ws = await this.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const creds = await this.getWorkspaceCredentials(ws.id);
    await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id,
      tenantId: ws.tenantId,
      workDir: ws.workDir,
      providerId: ws.providerId,
      apiKey: creds.apiKey,
      model: ws.model,
      gitToken: creds.gitToken,
      gitUsername: creds.gitUsername,
    });

    const containerId = ws.containerId ?? undefined;
    const workDir = ws.workDir;

    const projects = await this.prisma.workspaceProject.findMany({ where: { workspaceId, enabled: true }, orderBy: { name: 'asc' } });
    const results: Array<{ name: string; action: string; ok: boolean; message: string }> = [];
    for (const project of projects) {
      try {
        const projectAbsPath = project.gitPath;
        const containerPath = containerId
          ? this.dockerWorkspaces.toContainerPath(projectAbsPath, workDir)
          : projectAbsPath;
        const containerWorkDir = containerId
          ? this.dockerWorkspaces.toContainerPath(workDir, workDir)
          : workDir;

        if (containerId ? !(await this.execPathExists(containerId, containerPath)) : !existsSync(projectAbsPath)) {
          if (!project.remoteUrl) {
            results.push({ name: project.name, action: 'skip', ok: false, message: 'missing path and no remote URL configured' });
            continue;
          }
          const target = containerPath === containerWorkDir ? '.' : project.path || '.';
          const gitCreds = creds.gitToken && creds.gitUsername ? { username: creds.gitUsername, token: creds.gitToken } : undefined;
          await this.git.clone(containerWorkDir, project.remoteUrl, target, containerId, gitCreds);
          results.push({ name: project.name, action: 'clone', ok: true, message: project.remoteUrl });
          // Auto-install after clone
          if (project.autoInstall && containerId) {
            try {
              const installResult = await this.installProjectDependencies(project.id);
              this.logger.log(`Auto-install after clone for ${project.name}: ${installResult}`);
            } catch (err) {
              this.logger.warn(`Auto-install after clone failed for ${project.name}: ${(err as Error).message}`);
            }
          }
          continue;
        }

        if (!(await this.git.validateRepo(containerPath, containerId))) {
          results.push({ name: project.name, action: 'skip', ok: false, message: 'path exists but is not a git repository' });
          continue;
        }

        const status = await this.git.status(containerPath, containerId);
        if (!status.clean) {
          results.push({ name: project.name, action: 'skip', ok: true, message: 'local changes present; skipped automatic pull' });
          continue;
        }
        const gitCreds = creds.gitToken && creds.gitUsername ? { username: creds.gitUsername, token: creds.gitToken } : undefined;
        const output = await this.git.pull(containerPath, 'origin', project.branch, containerId, gitCreds);
        results.push({ name: project.name, action: 'pull', ok: true, message: output.trim() || 'already up to date' });
        // Auto-install after pull
        if (project.autoInstall && containerId) {
          try {
            const installResult = await this.installProjectDependencies(project.id);
            this.logger.log(`Auto-install after pull for ${project.name}: ${installResult}`);
          } catch (err) {
            this.logger.warn(`Auto-install after pull failed for ${project.name}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        results.push({ name: project.name, action: 'error', ok: false, message: (err as Error).message });
      }
    }
    return results;
  }

  resolveContainerPath(hostPath: string, hostWorkDir: string, _containerId: string): string {
    return this.dockerWorkspaces.toContainerPath(hostPath, hostWorkDir);
  }

  async installProjectDependencies(projectId: string, _telegramUserId?: string): Promise<string> {
    const project = await this.prisma.workspaceProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    if (!project.autoInstall) return 'Auto-install is disabled for this project.';

    const containerId = project.workspace.containerId;
    if (!containerId) return 'No container running for this workspace.';

    const projectAbsPath = project.gitPath;
    const containerPath = this.dockerWorkspaces.toContainerPath(projectAbsPath, project.workspace.workDir);

    const installCmd = await this.detectProjectType(containerId, containerPath);
    if (!installCmd) return `No recognized project type found at ${project.path || '.'}`;

    try {
      const command = project.installCommand || installCmd;
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      await this.dockerWorkspaces.execInContainer(containerId, containerPath, cmd, args);
      return `✅ Dependencies installed (${command})`;
    } catch (err) {
      throw new Error(`Dependency installation failed: ${(err as Error).message}`);
    }
  }

  private async detectProjectType(containerId: string, containerPath: string): Promise<string | null> {
    const detectors: Array<{ file: string; command: string }> = [
      { file: 'package.json', command: 'npm install' },
      { file: 'requirements.txt', command: 'pip install -r requirements.txt' },
      { file: 'pyproject.toml', command: 'pip install -e .' },
      { file: 'Cargo.toml', command: 'cargo build' },
      { file: 'go.mod', command: 'go mod download' },
      { file: 'Gemfile', command: 'bundle install' },
      { file: 'composer.json', command: 'composer install' },
    ];

    for (const d of detectors) {
      try {
        await this.dockerWorkspaces.execInContainer(
          containerId, '/', 'test', ['-f', `${containerPath}/${d.file}`],
        );
        return d.command;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getWorkspaceCredentials(workspaceId: string, _telegramUserId?: string): Promise<{ apiKey: string | null; gitToken: string | null; gitUsername: string | null }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!ws) return { apiKey: null, gitToken: null, gitUsername: null };
    const gitToken = ws.gitToken ?? null;
    const gitUsername = ws.gitUsername ?? null;
    const apiKey = ws.apiKey ?? null;
    return { apiKey, gitToken, gitUsername };
  }

  private async execPathExists(containerId: string, path: string): Promise<boolean> {
    try {
      await execFileAsync('docker', ['exec', '-i', containerId, 'test', '-d', path]);
      return true;
    } catch {
      try {
        await execFileAsync('docker', ['exec', '-i', containerId, 'test', '-f', path]);
        return true;
      } catch {
        return false;
      }
    }
  }

  async findProjectById(projectId: string) { return this.prisma.workspaceProject.findUnique({ where: { id: projectId } }); }
  async removeProject(projectId: string) { const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId } }); if (!project) throw new NotFoundException(`Project ${projectId} not found`); return this.prisma.workspaceProject.delete({ where: { id: projectId } }); }
  async getProjects(workspaceId: string) { return this.prisma.workspaceProject.findMany({ where: { workspaceId, enabled: true }, orderBy: { name: 'asc' } }); }
}
