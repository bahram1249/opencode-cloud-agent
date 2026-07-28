import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { DockerWorkspaceService } from './docker-workspace.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/workspace.dto';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly git: GitCommandsService,
    private readonly dockerWorkspaces: DockerWorkspaceService,
  ) {}

  async addProject(
    workspaceId: string,
    dto: CreateProjectDto,
    telegramUserId = 'legacy',
    gitAuthEnv?: Record<string, string>,
    gitAuthCleanup?: () => Promise<void>,
  ) {
    const ws = await this.findWorkspaceOrThrow(workspaceId);
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
      if (containerId) {
        await this.git.clone(containerWorkDir, dto.remoteUrl, target, containerId, gitAuthEnv);
        if (gitAuthCleanup) await gitAuthCleanup().catch(() => {});
      } else {
        await this.git.clone(containerWorkDir, dto.remoteUrl, target, containerId);
      }
      didClone = true;
    }
    if (!(containerId ? await this.execPathExists(containerId, containerPath) : existsSync(containerPath))) {
      throw new BadRequestException(`Path does not exist: ${containerPath}`);
    }
    if (!(await this.git.validateRepo(containerPath, containerId))) {
      throw new BadRequestException(`Not a git repository at "${relPath}".`);
    }
    const project = await this.prisma.workspaceProject.create({
      data: {
        workspaceId,
        name: dto.name || basename(relPath === '.' ? ws.name : relPath),
        gitPath: absPath,
        path: relPath,
        remoteUrl: dto.remoteUrl,
      },
    });
    return project;
  }

  async updateProject(projectId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId }, include: { workspace: true } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.path) {
      data.path = dto.path;
      data.gitPath = dto.path === '.' ? project.workspace.workDir : resolve(project.workspace.workDir, dto.path);
    }
    if (dto.branch) data.branch = dto.branch;
    if (dto.remoteUrl !== undefined) data.remoteUrl = dto.remoteUrl;
    if (dto.autoInstall !== undefined) data.autoInstall = dto.autoInstall;
    if (dto.installCommand !== undefined) data.installCommand = dto.installCommand;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.workspaceProject.update({ where: { id: projectId }, data });
  }

  async findProjectById(projectId: string) {
    return this.prisma.workspaceProject.findUnique({ where: { id: projectId } });
  }

  async removeProject(projectId: string) {
    const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return this.prisma.workspaceProject.delete({ where: { id: projectId } });
  }

  async getProjects(workspaceId: string) {
    return this.prisma.workspaceProject.findMany({ where: { workspaceId, enabled: true }, orderBy: { name: 'asc' } });
  }

  resolveContainerPath(hostPath: string, hostWorkDir: string): string {
    return this.dockerWorkspaces.toContainerPath(hostPath, hostWorkDir);
  }

  private async findWorkspaceOrThrow(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, include: { projects: true, tenant: true } });
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    return ws;
  }

  private async execPathExists(containerId: string, path: string): Promise<boolean> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
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
}
