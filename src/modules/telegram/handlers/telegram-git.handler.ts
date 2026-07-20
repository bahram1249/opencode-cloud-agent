import { Injectable, Logger } from '@nestjs/common';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { GitAuthService } from 'src/modules/git-auth/git-auth.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { showGitMenu } from '../ui/telegram-menus';
import type { MenuServices } from '../ui/telegram-menus';

@Injectable()
export class TelegramGitHandler {
  private readonly logger = new Logger(TelegramGitHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly gitCommandsService: GitCommandsService,
    private readonly gitAuthService: GitAuthService,
  ) {}

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: null as never,
    };
  }

  async handleGitCmd(chatId: string, userId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      await showGitMenu(chatId, userId, this.menuSvc);
      return;
    }

    const sub = args[0].toLowerCase();
    const rest = args.slice(1).join(' ');

    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    if (sub === 'login' || sub === 'logout' || sub === 'credential-status' || sub === 'test') {
      try {
        switch (sub) {
          case 'login':
            await this.handleGitLoginCmd(chatId, userId, active.id, rest);
            return;
          case 'logout':
            await this.handleGitLogoutCmd(chatId, userId, active.id);
            return;
          case 'credential-status':
            await this.handleGitStatusCmd(chatId, userId, active.id);
            return;
          case 'test':
            await this.handleGitTestCmd(chatId, userId, active.id, active.containerId ?? undefined);
            return;
        }
      } catch (err) {
        await this.notificationService.sendRaw(chatId, `Error: ${(err as Error).message}`);
      }
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    let gitPath: string | null = null;
    let projName = 'workspace';

    const possibleProj = args.find((a) => projects.some((p) => p.name === a));
    if (possibleProj) {
      const proj = projects.find((p) => p.name === possibleProj);
      if (proj) {
        gitPath = proj.gitPath;
        projName = proj.name;
      }
    } else if (projects.length === 1) {
      gitPath = projects[0].gitPath;
      projName = projects[0].name;
    } else {
      gitPath = active.workDir;
    }

    if (!gitPath || !(await this.gitCommandsService.validateRepo(gitPath))) {
      await this.notificationService.sendRaw(chatId, `Not a git repo: ${gitPath}. Add a project: /project add <name> <path>`);
      return;
    }

    try {
      switch (sub) {
        case 'status': {
          const s = await this.gitCommandsService.status(gitPath);
          const files = s.files.slice(0, 20).map((f) => `  ${f}`).join('\n');
          await this.notificationService.sendRaw(
            chatId,
            `📊 Git Status (${projName})\nBranch: ${s.branch}\n${s.clean ? 'Clean' : `Changes:\n${files}`}`,
          );
          break;
        }
        case 'diff': {
          const d = await this.gitCommandsService.diff(gitPath);
          if (!d.trim()) {
            await this.notificationService.sendRaw(chatId, `No unstaged changes (${projName}).`);
            return;
          }
          const clipped = d.length > 3500 ? d.slice(0, 3500) + '...' : d;
          await this.notificationService.sendRaw(chatId, `📝 Diff (${projName}):\n${clipped}`);
          break;
        }
        case 'add': {
          await this.gitCommandsService.add(gitPath);
          await this.notificationService.sendRaw(chatId, `✅ Staged all changes (${projName})`);
          break;
        }
        case 'commit': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /git commit <message>');
            return;
          }
          const r = await this.gitCommandsService.commit(gitPath, rest);
          await this.notificationService.sendRaw(chatId, `✅ Committed (${projName}): ${r.sha.slice(0, 7)}`);
          break;
        }
        case 'push': {
          const pushCreds = await this.workspaceService.getWorkspaceCredentials(active.id);
          const pushGitCreds = pushCreds.gitToken && pushCreds.gitUsername ? { username: pushCreds.gitUsername, token: pushCreds.gitToken } : undefined;
          await this.gitCommandsService.push(gitPath, undefined, undefined, active.containerId ?? undefined, pushGitCreds);
          await this.notificationService.sendRaw(chatId, `✅ Pushed (${projName})`);
          break;
        }
        case 'pull': {
          const pullCreds = await this.workspaceService.getWorkspaceCredentials(active.id);
          const pullGitCreds = pullCreds.gitToken && pullCreds.gitUsername ? { username: pullCreds.gitUsername, token: pullCreds.gitToken } : undefined;
          await this.gitCommandsService.pull(gitPath, undefined, undefined, active.containerId ?? undefined, pullGitCreds);
          await this.notificationService.sendRaw(chatId, `✅ Pulled (${projName})`);
          break;
        }
        case 'log': {
          const r = await this.gitCommandsService.log(gitPath, 5);
          const lines = r.commits.map((c) => `${c.sha.slice(0, 7)} ${c.message} (${c.author})`);
          await this.notificationService.sendRaw(chatId, `📋 Log (${projName}):\n${lines.join('\n')}`);
          break;
        }
        case 'pr': {
          if (!active.containerId) {
            await this.notificationService.sendRaw(chatId, 'No container running for this workspace.');
            return;
          }
          const creds = await this.workspaceService.getWorkspaceCredentials(active.id);
          if (!creds.gitToken) {
            await this.notificationService.sendRaw(chatId, 'No git credentials configured.\n/git login <username> <token> <remote-url>');
            return;
          }
          try {
            const containerCwd = gitPath ? this.workspaceService.resolveContainerPath(gitPath, active.workDir, active.containerId) : '/workspace';
            const output = await this.gitCommandsService.exec(active.containerId, containerCwd, 'gh', ['pr', 'create', '--fill']);
            const url = output.trim().split('\n').pop() || output.trim();
            await this.notificationService.sendRaw(chatId, `✅ PR created (${projName}): ${url}`);
          } catch (err) {
            const msg = (err as Error).message;
            if (msg.includes('no commits')) {
              await this.notificationService.sendRaw(chatId, 'No commits to create a PR. Commit first: /git commit -m "msg"');
            } else {
              await this.notificationService.sendRaw(chatId, `PR error: ${msg}`);
            }
          }
          break;
        }
        default:
          await showGitMenu(chatId, userId, this.menuSvc);
      }
    } catch (err) {
      const message = (err as Error).message;
      if (this.gitAuthService.isGitAuthError(message) && active) {
        await this.gitAuthService.removeCredentials(active.id);
        await this.notificationService.sendRaw(
          chatId,
          `❌ Git operation failed — credentials rejected by server\n\n` +
          `  Credentials have been cleared.\n\n` +
          `Please set new credentials:\n` +
          `  /git login <username> <token> <remote-url>\n\n` +
          `Example:\n` +
          `  /git login myuser <new-token> https://github.com/myorg/project.git`,
        );
      } else {
        await this.notificationService.sendRaw(chatId, `Git error: ${message}`);
      }
    }
  }

  async handleGitCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    const project = await this.workspaceService.findProjectById(value);
    if (!project) return;

    try {
      switch (type) {
        case 'git:diff': {
          const d = await this.gitCommandsService.diff(project.gitPath);
          const clipped = d.length > 3500 ? d.slice(0, 3500) + '...' : d;
          await this.notificationService.sendRaw(chatId, `📝 Diff (${project.name}):\n${clipped || 'No changes'}`);
          break;
        }
        case 'git:add': {
          await this.gitCommandsService.add(project.gitPath);
          await this.notificationService.sendRaw(chatId, `✅ Staged (${project.name})`);
          break;
        }
        case 'git:push': {
          const pushCreds = await this.workspaceService.getWorkspaceCredentials(project.workspaceId);
          const pushGitCreds = pushCreds.gitToken && pushCreds.gitUsername ? { username: pushCreds.gitUsername, token: pushCreds.gitToken } : undefined;
          const pushWs = await this.workspaceService.findById(project.workspaceId);
          await this.gitCommandsService.push(project.gitPath, undefined, undefined, pushWs?.containerId ?? undefined, pushGitCreds);
          await this.notificationService.sendRaw(chatId, `✅ Pushed (${project.name})`);
          break;
        }
        case 'git:pull': {
          const pullCreds = await this.workspaceService.getWorkspaceCredentials(project.workspaceId);
          const pullGitCreds = pullCreds.gitToken && pullCreds.gitUsername ? { username: pullCreds.gitUsername, token: pullCreds.gitToken } : undefined;
          const pullWs = await this.workspaceService.findById(project.workspaceId);
          await this.gitCommandsService.pull(project.gitPath, undefined, undefined, pullWs?.containerId ?? undefined, pullGitCreds);
          await this.notificationService.sendRaw(chatId, `✅ Pulled (${project.name})`);
          break;
        }
        case 'git:log': {
          const r = await this.gitCommandsService.log(project.gitPath, 5);
          const lines = r.commits.map((c) => `${c.sha.slice(0, 7)} ${c.message}`);
          await this.notificationService.sendRaw(chatId, `📋 Log (${project.name}):\n${lines.join('\n')}`);
          break;
        }
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Git error: ${(err as Error).message}`);
    }
  }

  private async handleGitLoginCmd(chatId: string, userId: string, workspaceId: string, args: string): Promise<void> {
    const parts = args.split(' ').filter(Boolean);
    if (parts.length < 2) {
      await this.notificationService.sendRaw(
        chatId,
        'Usage: /git login <username> <token> [remote-url]\n\n' +
        'Examples:\n' +
        '  /git login myuser ghp_abc123def456\n' +
        '  /git login myuser ghp_abc123def456 https://github.com/myorg/project.git\n' +
        '  /git login myuser glpat-xyz789 https://gitlab.company.com/team/repo.git',
      );
      return;
    }

    const username = parts[0];
    const token = parts[1];
    const remoteUrl = parts[2] || null;

    let validationUrl = remoteUrl;
    if (!validationUrl) {
      const projects = await this.workspaceService.getProjects(workspaceId);
      const projectWithRemote = projects.find(p => p.remoteUrl);
      if (projectWithRemote?.remoteUrl) {
        validationUrl = projectWithRemote.remoteUrl;
      }
    }

    if (!validationUrl) {
      const result = await this.gitAuthService.setWorkspaceCredentials(workspaceId, username, token);
      await this.notificationService.sendRaw(
        chatId,
        `✅ Git credentials stored for *${result.username}*\nToken: ${result.tokenMasked}\n\n` +
        'No remote URL provided — validation skipped. Add a project with a remote URL to verify:\n' +
        '  /project add <name> <path> <remote-url>\n\n' +
        'You can also manage git credentials in Workspace Settings → Manage Git.',
      );
      return;
    }

    await this.notificationService.sendRaw(
      chatId,
      `⏳ Validating git credentials...\n\n` +
      `  Testing: git ls-remote ${validationUrl.replace(/https?:\/\//, 'https://***@')}\n` +
      `  Username: ${username}\n` +
      `  Token: ${this.gitAuthService.maskToken(token)}`,
    );

    const active = await this.workspaceService.findById(workspaceId, userId);
    const containerId = active?.containerId ?? undefined;
    const result = await this.gitAuthService.validateToken(validationUrl, username, token, containerId);

    if (result.valid) {
      const stored = await this.gitAuthService.setWorkspaceCredentials(workspaceId, username, token);
      await this.notificationService.sendRaw(
        chatId,
        `✅ Git credentials verified!\n\n` +
        `  Username:  ${stored.username}\n` +
        `  Token:     ${stored.tokenMasked}\n` +
        `  Remote:    ${validationUrl}\n` +
        `  Test:      ✔ git ls-remote succeeded (${result.refCount} refs found)\n\n` +
        `Manage in Workspace Settings → Manage Git.`,
      );
    } else {
      const hints: Record<string, string> = {
        auth: '\n  • Token is expired or revoked — generate a new one\n  • Token lacks access to this repository\n  • Username doesn\'t match the token',
        network: '\n  • Remote URL may be incorrect\n  • Host is unreachable — check DNS/firewall\n  • Repository does not exist',
      };

      await this.notificationService.sendRaw(
        chatId,
        `❌ Authentication failed\n\n` +
        `  ${result.errorMessage}\n` +
        `  Remote: ${validationUrl}\n` +
        (hints[result.errorType ?? ''] ?? '\n  • Unknown error — check the remote URL and token') +
        `\n\nExamples to try:\n` +
        `  /git login ${username} <new-token> ${validationUrl}\n` +
        `  /git login ${username} <new-token> https://github.com/org/repo.git\n\n` +
        `💡 GitHub tokens need "repo" scope for private repos\n` +
        `💡 GitLab tokens need "read_repository" scope at minimum`,
      );
    }
  }

  private async handleGitLogoutCmd(chatId: string, userId: string, workspaceId: string): Promise<void> {
    const status = await this.gitAuthService.getCredentialsStatus(workspaceId);
    if (!status.isSet) {
      await this.notificationService.sendRaw(chatId, 'No git credentials configured on this workspace.');
      return;
    }

    await this.gitAuthService.removeCredentials(workspaceId);
    await this.notificationService.sendRaw(
      chatId,
      `✅ Git credentials removed\n\n` +
      `  Workspace "${status.workspaceName}" no longer has git authentication.\n\n` +
      `To set up new credentials:\n` +
      `  /git login <username> <token> <remote-url>\n` +
      `  Or use Workspace Settings → Manage Git.`,
    );
  }

  private async handleGitStatusCmd(chatId: string, userId: string, workspaceId: string): Promise<void> {
    const status = await this.gitAuthService.getCredentialsStatus(workspaceId);

    if (!status.isSet) {
      await this.notificationService.sendRaw(
        chatId,
        '🔑 Git Credentials — Not configured\n\n' +
        'To connect to git repositories, set up credentials:\n' +
        '  /git login <username> <token> <remote-url>\n\n' +
        'Examples:\n' +
        '  /git login myuser ghp_abc123def456\n' +
        '  /git login myuser ghp_abc123def456 https://github.com/myorg/project.git\n' +
        '  /git login myuser glpat-xyz789 https://gitlab.com/mygroup/repo.git\n\n' +
        '💡 Getting a token:\n' +
        '  • GitHub:    https://github.com/settings/tokens (needs "repo" scope)\n' +
        '  • GitLab:    https://gitlab.com/-/user_settings/personal_access_tokens\n' +
        '  • Bitbucket: https://bitbucket.org/account/settings/app-passwords/\n' +
        '  • Self-hosted: Check your admin for the token URL',
      );
      return;
    }

    await this.notificationService.sendRaw(
      chatId,
      `🔍 Git Credential Status\n\n` +
      `  Workspace:  ${status.workspaceName}\n` +
      `  Status:     ✅ Active\n\n` +
      `  Username:   ${status.username}\n` +
      `  Token:      ${status.tokenMasked}\n` +
      `  Remote:     ${status.remoteUrl ?? 'not set'}\n` +
      `  Last verified: (not tracked)\n\n` +
      `/git test              — Re-validate credentials now\n` +
      `/git logout            — Remove credentials\n` +
      `/git credential-status — Show this credential info`,
    );
  }

  private async handleGitTestCmd(chatId: string, userId: string, workspaceId: string, containerId?: string): Promise<void> {
    const status = await this.gitAuthService.getCredentialsStatus(workspaceId);
    if (!status.isSet) {
      await this.notificationService.sendRaw(
        chatId,
        'No git credentials configured.\n/git login <username> <token> <remote-url>',
      );
      return;
    }

    await this.notificationService.sendRaw(
      chatId,
      `⏳ Re-validating credentials for ${status.username}...`,
    );

    const result = await this.gitAuthService.testCredentials(workspaceId, containerId);

    if (result.valid) {
      await this.notificationService.sendRaw(
        chatId,
        `✅ Credentials still valid for ${status.username}\n` +
        `  git ls-remote succeeded (${result.refCount} refs found)`,
      );
    } else if (result.errorType === 'auth') {
      await this.gitAuthService.removeCredentials(workspaceId);
      await this.notificationService.sendRaw(
        chatId,
        `❌ Git credentials rejected — token may be expired or revoked\n\n` +
        `  Credentials for "${status.username}" have been cleared.\n\n` +
        `Set new credentials:\n` +
        `  /git login ${status.username} <new-token> <remote-url>\n\n` +
        `Example:\n` +
        `  /git login ${status.username} <new-token> https://github.com/myorg/project.git`,
      );
    } else {
      await this.notificationService.sendRaw(
        chatId,
        `❌ Validation failed: ${result.errorMessage}\n` +
        `  /git login ${status.username} <new-token> <remote-url>`,
      );
    }
  }

  async handleGitLogoutRemove(workspaceId: string): Promise<void> {
    await this.gitAuthService.removeCredentials(workspaceId);
  }

  isGitAuthError(message: string): boolean {
    return this.gitAuthService.isGitAuthError(message);
  }

  maskToken(token: string): string {
    return this.gitAuthService.maskToken(token);
  }
}
