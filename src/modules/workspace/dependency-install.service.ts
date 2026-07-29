import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { DockerWorkspaceService } from './docker-workspace.service';

@Injectable()
export class DependencyInstallService {
  private readonly logger = new Logger(DependencyInstallService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly dockerWorkspaces: DockerWorkspaceService,
  ) {}

  async installProjectDependencies(projectId: string): Promise<string> {
    const project = await this.prisma.workspaceProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    if (!project.autoInstall) return 'Auto-install is disabled for this project.';

    const containerId = project.workspace.containerId;
    if (!containerId) return 'No container running for this workspace.';

    const containerPath = this.dockerWorkspaces.toContainerPath(project.gitPath, project.workspace.workDir);

    const installCmd = await this.detectProjectType(containerId, containerPath);
    if (!installCmd) return `No recognized project type found at ${project.path || '.'}`;

    try {
      const command = project.installCommand || installCmd;
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      await this.dockerWorkspaces.execInContainer(containerId, containerPath, cmd, args);
      return `Dependencies installed (${command})`;
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
        await this.dockerWorkspaces.execInContainer(containerId, '/', 'test', ['-f', `${containerPath}/${d.file}`]);
        return d.command;
      } catch {
        continue;
      }
    }
    return null;
  }
}
