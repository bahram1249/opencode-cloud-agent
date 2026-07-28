import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { DockerWorkspaceService } from './docker-workspace.service';
import { WorkspaceCrudService } from './workspace-crud.service';
import { ProjectService } from './project.service';
import { WorkspaceGitSyncService } from './workspace-git-sync.service';
import { DependencyInstallService } from './dependency-install.service';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, CreateProjectDto, UpdateProjectDto } from './dto/workspace.dto';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    public readonly crud: WorkspaceCrudService,
    public readonly projectService: ProjectService,
    public readonly gitSync: WorkspaceGitSyncService,
    public readonly depInstall: DependencyInstallService,
    private readonly git: GitCommandsService,
    private readonly dockerWorkspaces: DockerWorkspaceService,
    private readonly config: ConfigService,
  ) {}

  // ── Tenant ──────────────────────────────────────────────────────────

  ensureTenant(telegramUserId: string, displayName?: string) {
    return this.crud.ensureTenant(telegramUserId, displayName);
  }

  // ── Workspace CRUD ───────────────────────────────────────────────────

  create(dto: CreateWorkspaceDto, telegramUserId = 'legacy') {
    return this.crud.create(dto, telegramUserId);
  }

  findAll(telegramUserId?: string) {
    return this.crud.findAll(telegramUserId);
  }

  findById(id: string, telegramUserId?: string) {
    return this.crud.findById(id, telegramUserId);
  }

  findByName(name: string, telegramUserId?: string) {
    return this.crud.findByName(name, telegramUserId);
  }

  getActive(telegramUserId = 'legacy') {
    return this.crud.getActive(telegramUserId);
  }

  setActive(id: string, telegramUserId = 'legacy') {
    return this.crud.setActive(id, telegramUserId);
  }

  update(id: string, dto: UpdateWorkspaceDto, telegramUserId = 'legacy') {
    return this.crud.update(id, dto, telegramUserId);
  }

  remove(id: string, telegramUserId = 'legacy') {
    return this.crud.remove(id, telegramUserId);
  }

  // ── Provider ─────────────────────────────────────────────────────────

  async configureProvider(workspaceId: string, telegramUserId: string, providerId: string, apiKey: string) {
    const result = await this.crud.configureProvider(workspaceId, telegramUserId, providerId, apiKey);
    const ws = await this.crud.findById(workspaceId, telegramUserId);
    if (ws?.containerId) {
      await this.syncProjects(workspaceId, telegramUserId).catch((err: unknown) =>
        { this.logger.warn(`Background sync after configureProvider failed: ${(err as Error).message}`); },
      );
    }
    return result;
  }

  async setDefaultModel(workspaceId: string, telegramUserId: string, model: string) {
    const updated = await this.crud.setDefaultModel(workspaceId, telegramUserId, model);
    const ws = await this.crud.findById(workspaceId, telegramUserId);
    if (ws?.containerId) {
      await this.syncProjects(workspaceId, telegramUserId).catch((err: unknown) =>
        { this.logger.warn(`Background sync after setDefaultModel failed: ${(err as Error).message}`); },
      );
    }
    return updated;
  }

  async listOpenCodeModels(workspaceId: string, telegramUserId: string, providerId?: string): Promise<string[]> {
    const ws = await this.crud.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);

    const creds = await this.crud.getWorkspaceCredentials(ws.id);
    const containerId = await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id, tenantId: ws.tenantId, workDir: ws.workDir,
      providerId: ws.providerId, apiKey: creds.apiKey, model: ws.model,
      gitToken: creds.gitToken, gitUsername: creds.gitUsername,
    });
    if (!containerId) {
      throw new NotFoundException('Docker container not available.');
    }
    const spec = {
      workspaceId: ws.id, tenantId: ws.tenantId, workDir: ws.workDir,
      providerId: ws.providerId, apiKey: creds.apiKey, model: ws.model,
      gitToken: creds.gitToken, gitUsername: creds.gitUsername,
    };
    let credFilePath: string | undefined;
    const credContent = this.dockerWorkspaces.buildCredentialsFileContent(spec);
    if (credContent) {
      credFilePath = await this.dockerWorkspaces.writeCredentialsFile(containerId, credContent);
    }
    const execEnv: Record<string, string> = {};
    if (credFilePath) execEnv.CREDENTIALS_FILE = credFilePath;
    const dockerArgs = this.dockerWorkspaces.dockerExecNonInteractiveArgs(containerId, ws.workDir, 'opencode', ['models'], execEnv);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    let stdout: string;
    try {
      const result = await execFileAsync('docker', dockerArgs, { cwd: ws.workDir, maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
      stdout = result.stdout;
    } finally {
      if (credFilePath) this.dockerWorkspaces.removeCredentialsFile(containerId, credFilePath).catch(() => {});
    }

    const models = new Set<string>();
    for (const match of stdout.matchAll(/([a-z0-9][a-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.:-]*)/g)) {
      const model = match[1];
      if (!providerId || model.startsWith(`${providerId}/`)) models.add(model);
    }
    return [...models].sort();
  }

  // ── Projects ─────────────────────────────────────────────────────────

  async addProject(workspaceId: string, dto: CreateProjectDto, telegramUserId = 'legacy') {
    const creds = await this.crud.getWorkspaceCredentials(workspaceId);
    const ws = await this.crud.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const containerId = ws.containerId ?? undefined;

    let gitAuthEnv: Record<string, string> | undefined;
    let cleanup: (() => Promise<void>) | undefined;
    if (containerId && dto.remoteUrl && creds.gitToken && creds.gitUsername) {
      const content = this.dockerWorkspaces.buildCredentialsFileContent({
        workspaceId, tenantId: '', workDir: '',
        gitToken: creds.gitToken, gitUsername: creds.gitUsername,
      });
      const credFile = await this.dockerWorkspaces.writeCredentialsFile(containerId, content);
      const askpass = await this.dockerWorkspaces.writeGitAskpassScript(containerId);
      gitAuthEnv = {
        CREDENTIALS_FILE: credFile, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0',
        GIT_USERNAME: creds.gitUsername, GIT_TOKEN: creds.gitToken,
        GITHUB_USER: creds.gitUsername, GITHUB_TOKEN: creds.gitToken,
      };
      cleanup = async () => {
        await this.dockerWorkspaces.removeCredentialsFile(containerId, credFile).catch(() => {});
        await this.dockerWorkspaces.removeCredentialsFile(containerId, askpass).catch(() => {});
      };
    }

    const project = await this.projectService.addProject(workspaceId, dto, telegramUserId, gitAuthEnv, cleanup);
    if (dto.remoteUrl && project.autoInstall && containerId) {
      this.depInstall.installProjectDependencies(project.id).catch((err: unknown) =>
        { this.logger.warn(`Auto-install failed for ${project.name}: ${(err as Error).message}`); },
      );
    }
    return project;
  }

  updateProject(projectId: string, dto: UpdateProjectDto) {
    return this.projectService.updateProject(projectId, dto);
  }

  findProjectById(projectId: string) {
    return this.projectService.findProjectById(projectId);
  }

  removeProject(projectId: string) {
    return this.projectService.removeProject(projectId);
  }

  getProjects(workspaceId: string) {
    return this.projectService.getProjects(workspaceId);
  }

  resolveContainerPath(hostPath: string, hostWorkDir: string, _containerId: string): string {
    return this.dockerWorkspaces.toContainerPath(hostPath, hostWorkDir);
  }

  // ── Git Sync ─────────────────────────────────────────────────────────

  async syncProjects(workspaceId: string, telegramUserId = 'legacy'): Promise<Array<{ name: string; action: string; ok: boolean; message: string }>> {
    const ws = await this.crud.findById(workspaceId, telegramUserId);
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    const creds = await this.crud.getWorkspaceCredentials(ws.id);
    await this.dockerWorkspaces.ensureContainer({
      workspaceId: ws.id, tenantId: ws.tenantId, workDir: ws.workDir,
      providerId: ws.providerId, apiKey: creds.apiKey, model: ws.model,
      gitToken: creds.gitToken, gitUsername: creds.gitUsername,
    });
    return this.gitSync.syncProjects(workspaceId, ws.containerId ?? undefined, ws.workDir, creds);
  }

  // ── Dependencies ─────────────────────────────────────────────────────

  installProjectDependencies(projectId: string, _telegramUserId?: string) {
    return this.depInstall.installProjectDependencies(projectId);
  }

  // ── Credentials ──────────────────────────────────────────────────────

  getWorkspaceCredentials(workspaceId: string) {
    return this.crud.getWorkspaceCredentials(workspaceId);
  }

  async prepareGitAuthEnv(containerId: string, workspaceId: string): Promise<{ gitAuthEnv: Record<string, string>; cleanup: () => Promise<void> }> {
    const creds = await this.crud.getWorkspaceCredentials(workspaceId);
    if (!creds.gitToken || !creds.gitUsername) {
      return { gitAuthEnv: {}, cleanup: async () => {} };
    }
    const content = this.dockerWorkspaces.buildCredentialsFileContent({
      workspaceId, tenantId: '', workDir: '',
      gitToken: creds.gitToken, gitUsername: creds.gitUsername,
    });
    const credFile = await this.dockerWorkspaces.writeCredentialsFile(containerId, content);
    const askpass = await this.dockerWorkspaces.writeGitAskpassScript(containerId);
    return {
      gitAuthEnv: {
        CREDENTIALS_FILE: credFile,
        GIT_ASKPASS: askpass,
        GIT_TERMINAL_PROMPT: '0',
        GIT_USERNAME: creds.gitUsername,
        GIT_TOKEN: creds.gitToken,
        GITHUB_USER: creds.gitUsername,
        GITHUB_TOKEN: creds.gitToken,
      },
      cleanup: async () => {
        await this.dockerWorkspaces.removeCredentialsFile(containerId, credFile).catch(() => {});
        await this.dockerWorkspaces.removeCredentialsFile(containerId, askpass).catch(() => {});
      },
    };
  }
}
