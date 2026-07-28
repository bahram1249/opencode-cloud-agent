import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { CurrentInitDataUser as InitDataUser } from 'src/common/decorators/init-data-user.decorator';
import { WorkspaceService } from '../workspace/workspace.service';
import { GitCommandsService } from '../git-commands/git-commands.service';
import { GitAuthService } from '../git-auth/git-auth.service';

@ApiTags('Git')
@ApiBearerAuth()
@UseGuards(TelegramInitDataGuard)
@Controller('git')
export class GitController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly gitCommandsService: GitCommandsService,
    private readonly gitAuthService: GitAuthService,
  ) {}

  private async resolveProjectPath(workspaceId: string, projectId?: string): Promise<{ gitPath: string; containerPath: string; name: string; containerId?: string }> {
    const ws = await this.workspaceService.findById(workspaceId);
    if (!ws) throw new BadRequestException('Workspace not found');

    let hostPath: string;
    let projName: string;
    if (projectId) {
      const proj = await this.workspaceService.findProjectById(projectId);
      if (!proj) throw new BadRequestException('Project not found');
      hostPath = proj.gitPath;
      projName = proj.name;
    } else {
      const projects = await this.workspaceService.getProjects(workspaceId);
      if (projects.length === 0) throw new BadRequestException('No projects in workspace');
      hostPath = projects[0].gitPath;
      projName = projects[0].name;
    }

    const containerId = ws.containerId ?? undefined;
    const containerPath = containerId
      ? this.workspaceService.resolveContainerPath(hostPath, ws.workDir, ws.containerId!)
      : hostPath;

    return { gitPath: hostPath, containerPath, name: projName, containerId };
  }

  @Get(':workspaceId/status')
  @ApiOperation({ summary: 'Show git status' })
  async status(@Param('workspaceId') workspaceId: string, @Query('projectId') projectId?: string) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, projectId);
    return { project: name, ...await this.gitCommandsService.status(containerPath, containerId) };
  }

  @Get(':workspaceId/diff')
  @ApiOperation({ summary: 'Show git diff (unlimited length)' })
  async diff(@Param('workspaceId') workspaceId: string, @Query('projectId') projectId?: string) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, projectId);
    const d = await this.gitCommandsService.diff(containerPath, undefined, containerId);
    return { project: name, diff: d };
  }

  @Post(':workspaceId/commit')
  @ApiOperation({ summary: 'Stage all and commit' })
  async commit(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { message: string; projectId?: string },
  ) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, body.projectId);
    await this.gitCommandsService.add(containerPath, undefined, containerId);
    const result = await this.gitCommandsService.commit(containerPath, body.message, containerId);
    return { project: name, sha: result.sha };
  }

  @Post(':workspaceId/push')
  @ApiOperation({ summary: 'Push to remote' })
  async push(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { projectId?: string; remote?: string; branch?: string },
  ) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, body.projectId);
    let gitAuthCleanup: (() => Promise<void>) | undefined;
    let gitAuthEnv: Record<string, string> | undefined;
    if (containerId) {
      const prepared = await this.workspaceService.prepareGitAuthEnv(containerId, workspaceId);
      gitAuthEnv = Object.keys(prepared.gitAuthEnv).length > 0 ? prepared.gitAuthEnv : undefined;
      gitAuthCleanup = prepared.cleanup;
    }
    await this.gitCommandsService.push(containerPath, body.remote, body.branch, containerId, gitAuthEnv);
    if (gitAuthCleanup) await gitAuthCleanup().catch(() => {});
    return { project: name, pushed: true };
  }

  @Post(':workspaceId/pull')
  @ApiOperation({ summary: 'Pull from remote' })
  async pull(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { projectId?: string; remote?: string; branch?: string },
  ) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, body.projectId);
    let gitAuthCleanup: (() => Promise<void>) | undefined;
    let gitAuthEnv: Record<string, string> | undefined;
    if (containerId) {
      const prepared = await this.workspaceService.prepareGitAuthEnv(containerId, workspaceId);
      gitAuthEnv = Object.keys(prepared.gitAuthEnv).length > 0 ? prepared.gitAuthEnv : undefined;
      gitAuthCleanup = prepared.cleanup;
    }
    const output = await this.gitCommandsService.pull(containerPath, body.remote, body.branch, containerId, gitAuthEnv);
    if (gitAuthCleanup) await gitAuthCleanup().catch(() => {});
    return { project: name, output };
  }

  @Get(':workspaceId/log')
  @ApiOperation({ summary: 'Show recent commit log' })
  async log(
    @Param('workspaceId') workspaceId: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit = 10,
  ) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, projectId);
    const result = await this.gitCommandsService.log(containerPath, limit, containerId);
    return { project: name, ...result };
  }

  @Get(':workspaceId/branches')
  @ApiOperation({ summary: 'List branches' })
  async branches(@Param('workspaceId') workspaceId: string, @Query('projectId') projectId?: string) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, projectId);
    return { project: name, ...await this.gitCommandsService.branch(containerPath, containerId) };
  }

  @Post(':workspaceId/checkout')
  @ApiOperation({ summary: 'Switch branch with dirty-state handling' })
  async checkout(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { branch: string; projectId?: string; onDirty?: 'stash' | 'abort' },
  ) {
    const { containerPath, name, containerId } = await this.resolveProjectPath(workspaceId, body.projectId);
    const status = await this.gitCommandsService.status(containerPath, containerId);

    if (status.clean) {
      await this.gitCommandsService.checkout(containerPath, body.branch, containerId);
      return { project: name, branch: body.branch, action: 'checkout' };
    }

    if (body.onDirty === 'stash') {
      await this.gitCommandsService.stash(containerPath, `auto-stash before ${body.branch}`, containerId);
      await this.gitCommandsService.checkout(containerPath, body.branch, containerId);
      return { project: name, branch: body.branch, action: 'stash_and_checkout' };
    }

    return { project: name, branch: status.branch, dirty: true, message: 'Uncommitted changes. Set onDirty to "stash" or commit first.' };
  }

  @Post(':workspaceId/pr')
  @ApiOperation({ summary: 'Create PR using gh CLI' })
  async createPr(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { projectId?: string },
  ) {
    const ws = await this.workspaceService.findById(workspaceId);
    if (!ws?.containerId) throw new BadRequestException('No container running for this workspace');
    const { gitPath, name } = await this.resolveProjectPath(workspaceId, body.projectId);
    const containerCwd = this.workspaceService.resolveContainerPath(gitPath, ws.workDir, ws.containerId);
    const creds = await this.workspaceService.getWorkspaceCredentials(workspaceId);
    const ghEnv: Record<string, string> = {};
    if (creds.gitToken) {
      ghEnv.GH_TOKEN = creds.gitToken;
    }
    const output = await this.gitCommandsService.exec(ws.containerId, containerCwd, 'gh', ['pr', 'create', '--fill'], ghEnv);
    const url = output.trim().split('\n').pop() || output.trim();
    return { project: name, url };
  }

  @Get(':workspaceId/credentials')
  @ApiOperation({ summary: 'Get git credential status' })
  async credentialStatus(@Param('workspaceId') workspaceId: string) {
    return this.gitAuthService.getCredentialsStatus(workspaceId);
  }

  @Post(':workspaceId/credentials')
  @ApiOperation({ summary: 'Set git credentials' })
  async setCredentials(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { username: string; token: string; remoteUrl?: string },
    @InitDataUser('id') userId: number,
  ) {
    const ws = await this.workspaceService.findById(workspaceId, String(userId));
    const containerId = ws?.containerId ?? undefined;

    if (body.remoteUrl) {
      const result = await this.gitAuthService.validateToken(body.remoteUrl, body.username, body.token, containerId);
      if (!result.valid) {
        return { valid: false, error: result.errorMessage };
      }
    }

    const stored = await this.gitAuthService.setWorkspaceCredentials(workspaceId, body.username, body.token);
    return { valid: true, username: stored.username, tokenMasked: stored.tokenMasked };
  }

  @Delete(':workspaceId/credentials')
  @ApiOperation({ summary: 'Remove git credentials' })
  async removeCredentials(@Param('workspaceId') workspaceId: string) {
    await this.gitAuthService.removeCredentials(workspaceId);
    return { removed: true };
  }
}
