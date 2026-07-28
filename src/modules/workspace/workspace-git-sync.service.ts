import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { existsSync } from 'node:fs';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { DockerWorkspaceService } from './docker-workspace.service';

@Injectable()
export class WorkspaceGitSyncService {
  private readonly logger = new Logger(WorkspaceGitSyncService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly git: GitCommandsService,
    private readonly dockerWorkspaces: DockerWorkspaceService,
  ) {}

  async syncProjects(
    workspaceId: string,
    containerId: string | undefined,
    workDir: string,
    workspaceCredentials: { apiKey: string | null; gitToken: string | null; gitUsername: string | null },
  ): Promise<Array<{ name: string; action: string; ok: boolean; message: string }>> {
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

        if (containerId ? !(await this.checkPathExists(containerId, containerPath)) : !existsSync(projectAbsPath)) {
          if (!project.remoteUrl) {
            results.push({ name: project.name, action: 'skip', ok: false, message: 'missing path and no remote URL configured' });
            continue;
          }
          const target = containerPath === containerWorkDir ? '.' : project.path || '.';
          let cleanup: (() => Promise<void>) | undefined;
          const gToken = workspaceCredentials.gitToken;
          const gUser = workspaceCredentials.gitUsername;
          if (containerId && gToken && gUser) {
            const content = this.dockerWorkspaces.buildCredentialsFileContent({
              workspaceId, tenantId: '', workDir: '',
              gitToken: gToken,
              gitUsername: gUser,
            });
            const credFile = await this.dockerWorkspaces.writeCredentialsFile(containerId, content);
            const askpass = await this.dockerWorkspaces.writeGitAskpassScript(containerId);
            const gitAuthEnv = {
              CREDENTIALS_FILE: credFile, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0',
              GIT_USERNAME: gUser, GIT_TOKEN: gToken,
              GITHUB_USER: gUser, GITHUB_TOKEN: gToken,
            };
            cleanup = async () => {
              await this.dockerWorkspaces.removeCredentialsFile(containerId, credFile).catch(() => {});
              await this.dockerWorkspaces.removeCredentialsFile(containerId, askpass).catch(() => {});
            };
            await this.git.clone(containerWorkDir, project.remoteUrl, target, containerId, gitAuthEnv);
            if (cleanup) await cleanup().catch(() => {});
          } else {
            await this.git.clone(containerWorkDir, project.remoteUrl, target, containerId);
          }
          results.push({ name: project.name, action: 'clone', ok: true, message: project.remoteUrl });
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

          let pullEnv: Record<string, string> | undefined;
          let pullCleanup: (() => Promise<void>) | undefined;
          const gToken = workspaceCredentials.gitToken;
          const gUser = workspaceCredentials.gitUsername;
          if (containerId && gToken && gUser) {
            const content = this.dockerWorkspaces.buildCredentialsFileContent({
              workspaceId, tenantId: '', workDir: '',
              gitToken: gToken,
              gitUsername: gUser,
            });
            const credFile = await this.dockerWorkspaces.writeCredentialsFile(containerId, content);
            const askpass = await this.dockerWorkspaces.writeGitAskpassScript(containerId);
            pullEnv = {
              CREDENTIALS_FILE: credFile, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0',
              GIT_USERNAME: gUser, GIT_TOKEN: gToken,
              GITHUB_USER: gUser, GITHUB_TOKEN: gToken,
            };
          pullCleanup = async () => {
            await this.dockerWorkspaces.removeCredentialsFile(containerId, credFile).catch(() => {});
            await this.dockerWorkspaces.removeCredentialsFile(containerId, askpass).catch(() => {});
          };
        }
        const output = await this.git.pull(containerPath, 'origin', project.branch, containerId, pullEnv);
        if (pullCleanup) await pullCleanup().catch(() => {});
        results.push({ name: project.name, action: 'pull', ok: true, message: output.trim() || 'already up to date' });
      } catch (err) {
        results.push({ name: project.name, action: 'error', ok: false, message: (err as Error).message });
      }
    }
    return results;
  }

  private async checkPathExists(containerId: string, path: string): Promise<boolean> {
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
