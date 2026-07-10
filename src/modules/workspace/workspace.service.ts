import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, CreateProjectDto, UpdateProjectDto } from './dto/workspace.dto';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly git: GitCommandsService,
  ) {}

  async create(dto: CreateWorkspaceDto) {
    const absPath = resolve(dto.workDir);
    if (!existsSync(absPath)) {
      throw new BadRequestException(`Directory does not exist: ${absPath}`);
    }
    if (!statSync(absPath).isDirectory()) {
      throw new BadRequestException(`Path is not a directory: ${absPath}`);
    }

    const existing = await this.prisma.workspace.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Workspace "${dto.name}" already exists`);
    }

    return this.prisma.workspace.create({
      data: { name: dto.name, workDir: absPath },
      include: { projects: true },
    });
  }

  async findAll() {
    return this.prisma.workspace.findMany({
      orderBy: { name: 'asc' },
      include: { projects: true, _count: { select: { sessions: true } } },
    });
  }

  async findById(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: { projects: true },
    });
  }

  async findByName(name: string) {
    return this.prisma.workspace.findUnique({
      where: { name },
      include: { projects: true },
    });
  }

  async getActive() {
    return this.prisma.workspace.findFirst({
      where: { active: true },
      include: { projects: true },
    });
  }

  async setActive(id: string) {
    const ws = await this.findById(id);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);

    await this.prisma.workspace.updateMany({ where: { active: true }, data: { active: false } });
    await this.prisma.workspace.update({ where: { id }, data: { active: true } });

    return this.findById(id);
  }

  async update(id: string, dto: UpdateWorkspaceDto) {
    const ws = await this.findById(id);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);

    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.workDir) {
      const absPath = resolve(dto.workDir);
      if (!existsSync(absPath)) throw new BadRequestException(`Directory does not exist: ${absPath}`);
      data.workDir = absPath;
    }
    if (dto.active === true) {
      await this.prisma.workspace.updateMany({ where: { active: true }, data: { active: false } });
    }
    if (dto.active !== undefined) data.active = dto.active;

    return this.prisma.workspace.update({ where: { id }, data, include: { projects: true } });
  }

  async remove(id: string) {
    const ws = await this.findById(id);
    if (!ws) throw new NotFoundException(`Workspace ${id} not found`);
    return this.prisma.workspace.delete({ where: { id } });
  }

  async addProject(workspaceId: string, dto: CreateProjectDto) {
    const ws = await this.findById(workspaceId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);

    const absPath = resolve(dto.gitPath);
    if (!existsSync(absPath)) {
      throw new BadRequestException(`Path does not exist: ${absPath}`);
    }
    if (!this.git.validateRepo(absPath)) {
      throw new BadRequestException(`Not a git repository: ${absPath}. The folder must have a .git directory.`);
    }

    return this.prisma.workspaceProject.create({
      data: {
        workspaceId,
        name: dto.name,
        gitPath: absPath,
        branch: dto.branch ?? 'main',
        remoteUrl: dto.remoteUrl,
      },
    });
  }

  async updateProject(projectId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.workspaceProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.gitPath) {
      const absPath = resolve(dto.gitPath);
      if (!existsSync(absPath)) throw new BadRequestException(`Git path does not exist: ${absPath}`);
      data.gitPath = absPath;
    }
    if (dto.branch) data.branch = dto.branch;
    if (dto.remoteUrl !== undefined) data.remoteUrl = dto.remoteUrl;
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
    return this.prisma.workspaceProject.findMany({
      where: { workspaceId, enabled: true },
      orderBy: { name: 'asc' },
    });
  }
}
