import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { TelegramContext } from '../telegram.types';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { showProjectList, type MenuServices } from '../ui/telegram-menus';
import { cb } from '../utils/telegram-callback.utils';

@Injectable()
export class TelegramProjectHandler {
  private readonly logger = new Logger(TelegramProjectHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly gitCommandsService: GitCommandsService,
  ) {}

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: null as never,
    };
  }

  pendingBranchSwitches = new Map<string, string>();

  async handleProjectCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace. Switch or create: /workspace switch <name>');
      return;
    }

    if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
      await showProjectList(chatId, userId, this.menuSvc);
      return;
    }

    const action = args[0].toLowerCase();
    const rest = args.slice(1).join(' ').trim();
    const projects = await this.workspaceService.getProjects(active.id);

    try {
      switch (action) {
        case 'add':
        case 'new': {
          if (!rest) {
            await this.notificationService.sendRaw(
              chatId,
              'Usage: /project add <name> <path> [remote-url]\n' +
              '  name        — Display name for the project\n' +
              '  path        — Relative path inside workspace (. for root, frontend for /workspace/frontend)\n' +
              '  remote-url  — GitHub .git URL (optional, requires GitHub login first)',
            );
            return;
          }
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project add <name> <path> [remote-url]\nExample: /project add frontend frontend https://github.com/org/repo.git');
            return;
          }
          const projName = parts[0];
          const projPath = parts[1];
          const remoteUrl = parts.length > 2 ? parts.slice(2).join('') : undefined;

          if (remoteUrl) {
            const creds = await this.workspaceService.getWorkspaceCredentials(active.id);
            if (!creds.gitToken) {
              await this.notificationService.sendRawWithKeyboard(
                chatId,
                '⚠️ Adding a project with a remote URL requires git credentials.\n' +
                'This workspace has no git token configured.\n\n' +
                'Set credentials:\n' +
                '  /git login <username> <token> <remote-url>\n\n' +
                'Example:\n' +
                '  /git login myuser ghp_abc123 https://github.com/org/repo.git\n\n' +
                'Or use an absolute path if the repo already exists.',
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔙 Cancel', cb('nav:main'))],
                ]),
              );
              return;
            }
          }

          const proj = await this.workspaceService.addProject(active.id, {
            name: projName,
            path: projPath,
            remoteUrl,
          }, userId);
          await this.notificationService.sendRaw(chatId, `✅ Project "${proj.name}" added at ${proj.path || '.'}`);
          await showProjectList(chatId, userId, this.menuSvc);
          return;
        }

        case 'edit':
        case 'update': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project edit <name> <new-name|new-path>\nTo rename: /project edit <old-name> name:<new-name>\nTo change path: /project edit <name> path:<new-path>');
            return;
          }
          const editParts = rest.match(/^(\S+)\s+(?:name:|path:)?(.+)$/);
          if (!editParts) {
            await this.notificationService.sendRaw(chatId, 'Invalid format. Usage: /project edit <name> name:<new-name>  or  /project edit <name> path:<new-path>');
            return;
          }
          const [, projName, change] = editParts;
          const projects = await this.workspaceService.getProjects(active.id);
          const project = projects.find(p => p.name === projName);
          if (!project) {
            await this.notificationService.sendRaw(chatId, `Project "${projName}" not found in workspace "${active.name}".`);
            return;
          }
          if (change.startsWith('name:')) {
            await this.workspaceService.updateProject(project.id, { name: change.slice(5) });
            await this.notificationService.sendRaw(chatId, `✅ Project renamed to "${change.slice(5)}"`);
          } else if (change.startsWith('path:')) {
            await this.workspaceService.updateProject(project.id, { path: change.slice(5) });
            await this.notificationService.sendRaw(chatId, `✅ Project path updated`);
          } else {
            await this.workspaceService.updateProject(project.id, { name: change });
            await this.notificationService.sendRaw(chatId, `✅ Project renamed to "${change}"`);
          }
          await showProjectList(chatId, userId, this.menuSvc);
          return;
        }

        case 'branches':
        case 'branch': {
          const projName = rest || (projects.length === 1 ? projects[0].name : null);
          if (!projName) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project branches <name>');
            return;
          }
          const proj = projects.find(p => p.name === projName);
          if (!proj) {
            await this.notificationService.sendRaw(chatId, `Project "${projName}" not found.`);
            return;
          }
          const gitPath = proj.gitPath;
          if (!(await this.gitCommandsService.validateRepo(gitPath))) {
            await this.notificationService.sendRaw(chatId, `Not a git repo: ${projName}`);
            return;
          }
          const { current, branches } = await this.gitCommandsService.branch(gitPath);
          const lines = branches.map((b) => (b === current ? `👉 ${b}` : `   ${b}`)).join('\n');
          await this.notificationService.sendRaw(chatId, `📋 *Branches (${projName})*\n${lines}`);
          return;
        }
        case 'switch':
        case 'checkout': {
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project switch <name> <branch>');
            return;
          }
          const switchProj = projects.find(p => p.name === parts[0]);
          if (!switchProj) {
            await this.notificationService.sendRaw(chatId, `Project "${parts[0]}" not found.`);
            return;
          }
          const targetBranch = parts.slice(1).join(' ');
          const swGitPath = switchProj.gitPath;
          if (!(await this.gitCommandsService.validateRepo(swGitPath))) {
            await this.notificationService.sendRaw(chatId, `Not a git repo: ${switchProj.name}`);
            return;
          }
          const status = await this.gitCommandsService.status(swGitPath);
          if (status.clean) {
            await this.gitCommandsService.checkout(swGitPath, targetBranch);
            await this.notificationService.sendRaw(chatId, `✅ Switched ${switchProj.name} to branch "${targetBranch}"`);
          } else {
            const msg = `⚠️ ${switchProj.name} has uncommitted changes.\nBranch: ${status.branch}\nWhat do you want to do?`;
            await this.notificationService.sendRawWithKeyboard(
              chatId,
              msg,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback('📦 Stash', cb('branch:stash', `${switchProj.id}|${targetBranch}`)),
                  Markup.button.callback('💾 Commit', cb('branch:commit', `${switchProj.id}|${targetBranch}`)),
                ],
                [
                  Markup.button.callback('❌ Abort', cb('branch:abort', switchProj.id)),
                ],
              ]),
            );
          }
          return;
        }
        case 'install': {
          const installProj = projects.find(p => p.name === rest);
          if (!installProj) {
            await this.notificationService.sendRaw(chatId, `Project "${rest}" not found. Usage: /project install <name>`);
            return;
          }
          await this.notificationService.sendRaw(chatId, `Installing dependencies for "${installProj.name}"...`);
          try {
            const result = await this.workspaceService.installProjectDependencies(installProj.id, userId);
            await this.notificationService.sendRaw(chatId, result);
          } catch (err) {
            await this.notificationService.sendRaw(chatId, `Install error: ${(err as Error).message}`);
          }
          return;
        }
        case 'delete':
        case 'rm':
        case 'remove': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project delete <name>');
            return;
          }
          const projects = await this.workspaceService.getProjects(active.id);
          const project = projects.find(p => p.name === rest);
          if (!project) {
            await this.notificationService.sendRaw(chatId, `Project "${rest}" not found in workspace "${active.name}".`);
            return;
          }
          await this.workspaceService.removeProject(project.id);
          await this.notificationService.sendRaw(chatId, `🗑️ Project "${project.name}" deleted`);
          await showProjectList(chatId, userId, this.menuSvc);
          return;
        }

        default:
          await showProjectList(chatId, userId, this.menuSvc);
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Project error: ${(err as Error).message}`);
    }
  }

  async handleProjCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    const project = await this.workspaceService.findProjectById(value);

    if (!project) {
      await this.notificationService.sendRaw(chatId, 'Project not found.');
      return;
    }

    if (!(await this.gitCommandsService.validateRepo(project.gitPath))) {
      await this.notificationService.sendRaw(chatId, `Not a git repo: ${project.gitPath}`);
      return;
    }

    switch (type) {
      case 'proj:select': {
        try {
          const s = await this.gitCommandsService.status(project.gitPath);
          const files = s.files.slice(0, 15).map((f) => `  ${f}`).join('\n');
          await this.notificationService.sendRawWithKeyboard(
            chatId,
            `📊 *${project.name}* — ${'path' in project && project.path ? project.path : '.'}\nBranch: ${s.branch}\n${s.clean ? '✅ Clean' : `📝 Changes:\n${files}`}`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback('📝 Diff', cb('git:diff', project.id)),
                Markup.button.callback('➕ Add', cb('git:add', project.id)),
              ],
              [
                Markup.button.callback('💾 Commit', cb('git:add', project.id)),
                Markup.button.callback('🚀 Push', cb('git:push', project.id)),
              ],
              [
                Markup.button.callback('📋 Log', cb('git:log', project.id)),
                Markup.button.callback('📥 Pull', cb('git:pull', project.id)),
              ],
              [
                Markup.button.callback('🗑️ Delete', cb('proj:delete', project.id)),
                Markup.button.callback('🔙 Projects', cb('nav:projects')),
              ],
            ]),
          );
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Git error: ${(err as Error).message}`);
        }
        break;
      }
      case 'proj:delete': {
        try {
          await this.workspaceService.removeProject(project.id);
          await this.notificationService.sendRaw(chatId, `🗑️ Project "${project.name}" deleted`);
          await showProjectList(chatId, userId, this.menuSvc);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Delete error: ${(err as Error).message}`);
        }
        break;
      }
      default:
        await showProjectList(chatId, userId, this.menuSvc);
    }
  }

  async handleBranchCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    const [projectId, ...branchParts] = value.split('|');
    const branch = branchParts.join('|');
    const project = await this.workspaceService.findProjectById(projectId);
    if (!project) {
      await this.notificationService.sendRaw(chatId, 'Project not found.');
      return;
    }
    const gitPath = project.gitPath;
    if (!(await this.gitCommandsService.validateRepo(gitPath))) {
      await this.notificationService.sendRaw(chatId, `Not a git repo: ${project.name}`);
      return;
    }
    try {
      switch (type) {
        case 'branch:stash': {
          if (!branch) {
            await this.notificationService.sendRaw(chatId, 'No target branch specified.');
            return;
          }
          await this.gitCommandsService.stash(gitPath, `auto-stash before ${branch}`);
          await this.gitCommandsService.checkout(gitPath, branch);
          await this.notificationService.sendRaw(chatId, `✅ Stashed changes and switched ${project.name} to "${branch}"`);
          break;
        }
        case 'branch:commit': {
          if (!branch) {
            await this.notificationService.sendRaw(chatId, 'No target branch specified.');
            return;
          }
          await this.notificationService.sendRaw(chatId, `Send a commit message to commit changes on ${project.name}:`);
          this.pendingBranchSwitches.set(`${userId}:${projectId}`, branch);
          break;
        }
        case 'branch:abort': {
          await this.notificationService.sendRaw(chatId, `✅ Operation cancelled. No changes made to ${project.name}.`);
          break;
        }
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Branch error: ${(err as Error).message}`);
    }
  }

  async handlePendingBranchSwitch(chatId: string, userId: string, text: string): Promise<boolean> {
    for (const [key, branch] of this.pendingBranchSwitches) {
      if (key.startsWith(`${userId}:`)) {
        const projectId = key.split(':')[1];
        const project = await this.workspaceService.findProjectById(projectId);
        if (project) {
          const gitPath = project.gitPath;
          if (await this.gitCommandsService.validateRepo(gitPath)) {
            try {
              await this.gitCommandsService.commit(gitPath, text);
              await this.gitCommandsService.checkout(gitPath, branch);
              await this.notificationService.sendRaw(chatId, `✅ Committed and switched ${project.name} to "${branch}"`);
            } catch (err) {
              await this.notificationService.sendRaw(chatId, `Commit error: ${(err as Error).message}`);
            }
          }
        }
        this.pendingBranchSwitches.delete(key);
        return true;
      }
    }
    return false;
  }
}
