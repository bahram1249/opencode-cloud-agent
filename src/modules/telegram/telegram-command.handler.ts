import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { TelegramContext } from './telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { SessionService, type ActiveSession } from 'src/modules/session/session.service';
import { StreamService } from 'src/modules/stream/stream.service';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';
import { GitHubAuthService } from 'src/modules/github-auth/github-auth.service';

/** Helper: build callback data JSON string. */
function cb(t: string, v?: string): string {
  return JSON.stringify({ t, v: v ?? '' });
}

/** Parse callback data. */
function parseCb(data: string): { t: string; v: string } | null {
  try {
    const parsed = JSON.parse(data) as { t?: string; v?: string };
    if (!parsed.t) return null;
    return { t: parsed.t, v: parsed.v ?? '' };
  } catch {
    return null;
  }
}

@Injectable()
export class TelegramCommandHandler {
  private readonly logger = new Logger(TelegramCommandHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly sessionService: SessionService,
    private readonly streamService: StreamService,
    private readonly gitCommandsService: GitCommandsService,
    private readonly githubAuthService: GitHubAuthService,
  ) {}

  // ===================================================================
  //  CALLBACK DISPATCH
  // ===================================================================

  /** Route a callback query to the right handler. */
  async handleCallback(chatId: string, userId: string, data: string): Promise<void> {
    const action = parseCb(data);
    if (!action) return;

    const parts = action.t.split(':');
    const namespace = parts[0];
    const navTarget = parts.slice(1).join(':');
    const value = action.v;

    switch (namespace) {
      case 'nav':
        await this.handleNav(chatId, userId, navTarget);
        break;
      case 'ws':
        await this.handleWSCallback(chatId, userId, action.t, value);
        break;
      case 'proj':
        await this.handleProjCallback(chatId, userId, action.t, value);
        break;
      case 'git':
        await this.handleGitCallback(chatId, userId, action.t, value);
        break;
      case 'sess':
        await this.handleSessCallback(chatId, userId, action.t, value);
        break;
      case 'key':
        await this.handleKeyAction(chatId, userId, value);
        break;
      case 'model':
        await this.handleModelCallback(chatId, userId, action.t, value);
        break;
      case 'branch':
        await this.handleBranchCallback(chatId, userId, action.t, value);
        break;
      case 'setup':
        await this.handleSetupCallback(chatId, userId, action.t, value);
        break;
    }
  }

  // ===================================================================
  //  NAVIGATION
  // ===================================================================

  private async handleNav(chatId: string, userId: string, target: string): Promise<void> {
    switch (target) {
      case 'main':
        await this.showMainMenu(chatId, userId);
        break;
      case 'git':
        await this.showGitMenu(chatId, userId);
        break;
      case 'ws':
        await this.showWorkspaceMenu(chatId, userId);
        break;
      case 'projects':
        await this.showProjectList(chatId, userId);
        break;
    }
  }

  // ===================================================================
  //  GITHUB AUTH HANDLERS
  // ===================================================================

  async handleLoginCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    if (args[0]?.toLowerCase() !== 'github') {
      await this.notificationService.sendRaw(chatId, 'Usage: /login github');
      return;
    }

    if (!this.githubAuthService.isConfigured()) {
      await this.notificationService.sendRaw(chatId, 'GitHub OAuth is not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).');
      return;
    }

    const url = this.githubAuthService.generateAuthUrl(userId, chatId);
    await this.notificationService.sendRawWithKeyboard(
      chatId,
      'Click below to authorize GitHub:',
      Markup.inlineKeyboard([Markup.button.url('Authorize GitHub', url)]),
    );
  }

  async handleLogoutCmd(ctx: TelegramContext, _args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    try {
      await this.githubAuthService.revokeToken(userId);
      await this.notificationService.sendRaw(chatId, '✅ Logged out from GitHub.');
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `❌ Logout failed: ${(err as Error).message}`);
    }
  }

  // ===================================================================
  //  MAIN SESSION / SEND HANDLERS
  // ===================================================================

  /** Called when user sends plain text. Routes to session or starts one. */
  async handleTextInput(chatId: string, userId: string, text: string): Promise<void> {
    // Check if user is in setup wizard awaiting API key
    const state = this.setupWizardState.get(userId);
    if (state && state.step === 'api-key' && state.providerId) {
      await this.handleSetupCallback(chatId, userId, 'setup:apikey', text);
      return;
    }

    const existing = this.sessionService.getUserSession(userId);
    if (existing) {
      await this.handleSendToSession(chatId, userId, text);
    } else {
      await this.handleStartSession(chatId, userId, text);
    }
  }

  /** /session <prompt> — Start interactive session. */
  async handleStartSessionCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await this.notificationService.sendRaw(chatId, 'Usage: /session <prompt>\nExample: /session Fix the login bug');
      return;
    }

    await this.handleStartSession(chatId, userId, prompt);
  }

  /** /send <text> — Send to active session. */
  async handleSendCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    const text = args.join(' ').trim();

    if (!text) {
      await this.notificationService.sendRaw(chatId, 'Usage: /send <text>');
      return;
    }

    await this.handleSendToSession(chatId, userId, text);
  }

  /** /cancel — Cancel active session and show menu. */
  async handleCancelCmd(ctx: TelegramContext, _args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    this.sessionService.cancelSession(session.id);
    await this.notificationService.sendRaw(chatId, `🛑 Session ${session.publicId} cancelled.`);
    await this.showMainMenu(chatId, userId);
  }

  // ===================================================================
  //  WORKSPACE COMMANDS
  // ===================================================================

  async handleWorkspaceCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    if (args.length === 0) {
      await this.showWorkspaceMenu(chatId, userId);
      return;
    }

    const action = args[0].toLowerCase();
    const rest = args.slice(1).join(' ');

    try {
      switch (action) {
        case 'create':
        case 'new': {
          if (!rest) {
            await this.notificationService.sendRaw(
              chatId,
              'Usage: /workspace create <name>\n' +
              'Then configure a provider:\n' +
              '  /workspace provider <id> <api-key>\n' +
              '  Common provider IDs: opencode, openai, anthropic\n\n' +
              'Then list and pick a model:\n' +
              '  /workspace models <provider-id>\n' +
              '  /workspace model <provider/model>\n\n' +
              'Then log in to GitHub (optional):\n' +
              '  /workspace github-login <name>',
            );
            return;
          }
          const ws = await this.workspaceService.create({ name: rest }, userId);
          await this.notificationService.sendRaw(chatId, `✅ Workspace "${ws.name}" created.\nNext step: /workspace provider <provider-id> <api-key>`);
          break;
        }
        case 'switch': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace switch <name>');
            return;
          }
          const ws = await this.workspaceService.findByName(rest, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found.`);
            return;
          }
          await this.workspaceService.setActive(ws.id, userId);
          await this.notificationService.sendRaw(chatId, `✅ Switched to workspace "${ws.name}"`);
          break;
        }
        case 'list':
        case 'ls': {
          const list = await this.workspaceService.findAll(userId);
          if (list.length === 0) {
            await this.notificationService.sendRaw(chatId, 'No workspaces. Create: /workspace create <name>');
            return;
          }
          const lines = list.map((w) => `• ${w.name}${w.active ? ' (active)' : ''} — ${w.workDir}`);
          await this.notificationService.sendRaw(chatId, `Workspaces:\n${lines.join('\n')}`);
          return;
        }
        case 'show':
        case 'current': {
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Switch: /workspace switch <name>');
            return;
          }
          await this.sendWorkspaceDetails(chatId, active);
          return;
        }
        case 'edit':
        case 'rename': {
          const editParts = rest.match(/^(\S+)\s+(.+)$/);
          if (!editParts) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace rename <current-name> <new-name>');
            return;
          }
          const ws = await this.workspaceService.findByName(editParts[1], userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${editParts[1]}" not found.`);
            return;
          }
          await this.workspaceService.update(ws.id, { name: editParts[2] }, userId);
          await this.notificationService.sendRaw(chatId, `✅ Workspace renamed to "${editParts[2]}"`);
          break;
        }

        case 'provider': {
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(
              chatId,
              'Usage: /workspace provider <provider-id> <api-key>\n' +
              'Common providers:\n' +
              '  opencode    — OpenCode Zen/Go (get key at https://opencode.ai/auth)\n' +
              '  openai      — OpenAI models\n' +
              '  anthropic   — Anthropic Claude\n' +
              '  github-copilot — GitHub Copilot\n' +
              'Example: /workspace provider opencode sk-opencode-xxx',
            );
            return;
          }
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          const updated = await this.workspaceService.configureProvider(active.id, userId, parts[0], parts.slice(1).join(' '));
          await this.notificationService.sendRaw(chatId, `✅ Provider "${parts[0]}" configured for "${updated.name}".\nNext: /workspace models ${parts[0]} to pick a model.`);
          break;
        }
        case 'models': {
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          await this.showModelPicker(chatId, userId, active.id, rest || active.providerId || undefined);
          return;
        }
        case 'model': {
          if (!rest.includes('/')) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace model <provider/model-id>\nTip: run /workspace models <provider-id> and tap a model.');
            return;
          }
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          await this.workspaceService.setDefaultModel(active.id, userId, rest);
          await this.notificationService.sendRaw(chatId, `✅ Default OpenCode model set to ${rest}`);
          break;
        }
        case 'sync': {
          const ws = await this.workspaceService.findByName(rest, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found.`);
            return;
          }
          await this.notificationService.sendRaw(chatId, `Syncing projects for "${ws.name}"...`);
          const results = await this.workspaceService.syncProjects(ws.id, userId);
          const lines = results.map((r) => `• ${r.name}: ${r.ok ? '✅' : '❌'} ${r.action} — ${r.message}`);
          await this.notificationService.sendRaw(chatId, `Sync results for "${ws.name}":\n${lines.join('\n')}`);
          return;
        }
        case 'github-login':
        case 'gh-login': {
          const ws = await this.workspaceService.findByName(rest, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found. Usage: /workspace github-login <name>`);
            return;
          }
          if (!this.githubAuthService.isConfigured()) {
            await this.notificationService.sendRaw(chatId, 'GitHub OAuth is not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).');
            return;
          }
          const url = this.githubAuthService.generateAuthUrl(userId, chatId, ws.id);
          await this.notificationService.sendRawWithKeyboard(
            chatId,
            `Click below to authorize GitHub for workspace "${ws.name}":`,
            Markup.inlineKeyboard([Markup.button.url('Authorize GitHub', url)]),
          );
          return;
        }
        case 'delete':
        case 'rm':
        case 'remove': {
          const ws = await this.workspaceService.findByName(rest, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found.`);
            return;
          }
          await this.workspaceService.remove(ws.id, userId);
          await this.notificationService.sendRaw(chatId, `🗑️ Workspace "${ws.name}" deleted.`);
          break;
        }
        default:
          await this.showWorkspaceMenu(chatId, userId);
          return;
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Error: ${(err as Error).message}`);
      return;
    }

    await this.showWorkspaceMenu(chatId, userId);
  }

  // ===================================================================
  //  PROJECT COMMANDS
  // ===================================================================

  async handleProjectCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace. Switch or create: /workspace switch <name>');
      return;
    }

    if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
      await this.showProjectList(chatId, userId);
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

          // If remote URL is provided, check GitHub auth first
          if (remoteUrl) {
            const creds = await this.workspaceService.getWorkspaceCredentials(active.id);
            if (!creds.githubToken) {
              await this.notificationService.sendRawWithKeyboard(
                chatId,
                '⚠️ Adding a project with a remote URL requires GitHub access.\n' +
                'This workspace has no GitHub token configured.\n\n' +
                'Options:\n' +
                '  /workspace github-login <name>  — Log in to GitHub\n' +
                '  Or use absolute path if the repo already exists',
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔑 GitHub Login', cb('ws:ghlogin', active.id))],
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
          await this.showProjectList(chatId, userId);
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
            // Treat as rename for convenience
            await this.workspaceService.updateProject(project.id, { name: change });
            await this.notificationService.sendRaw(chatId, `✅ Project renamed to "${change}"`);
          }
          await this.showProjectList(chatId, userId);
          return;
        }


        case 'provider': {
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace provider <provider-id> <api-key>\nExample: /workspace provider opencode sk-...');
            return;
          }
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          const updated = await this.workspaceService.configureProvider(active.id, userId, parts[0], parts.slice(1).join(' '));
          await this.notificationService.sendRaw(chatId, `✅ Provider configured for "${updated.name}". Now run /workspace models ${parts[0]} to pick a default model.`);
          break;
        }
        case 'models': {
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          await this.showModelPicker(chatId, userId, active.id, rest || active.providerId || undefined);
          return;
        }
        case 'model': {
          if (!rest.includes('/')) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace model <provider/model-id>\nTip: run /workspace models <provider-id> and tap a model.');
            return;
          }
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          await this.workspaceService.setDefaultModel(active.id, userId, rest);
          await this.notificationService.sendRaw(chatId, `✅ Default OpenCode model set to ${rest}`);
          break;
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
            // Dirty state — offer options
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
          // Dependency install will be handled by the auto-install service
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
          await this.showProjectList(chatId, userId);
          return;
        }

        default:
          await this.showProjectList(chatId, userId);
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Project error: ${(err as Error).message}`);
    }
  }

  // ===================================================================
  //  GIT COMMAND
  // ===================================================================

  async handleGitCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    if (args.length === 0) {
      await this.showGitMenu(chatId, userId);
      return;
    }

    const sub = args[0].toLowerCase();
    const rest = args.slice(1).join(' ');

    // Find a project to run on
    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    let gitPath: string | null = null;
    let projName = 'workspace';

    // Check if last arg is a project name
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
          await this.gitCommandsService.push(gitPath);
          await this.notificationService.sendRaw(chatId, `✅ Pushed (${projName})`);
          break;
        }
        case 'pull': {
          await this.gitCommandsService.pull(gitPath);
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
          if (!creds.githubToken) {
            await this.notificationService.sendRaw(chatId, 'GitHub token not configured. Run /workspace github-login <name> first.');
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
          await this.showGitMenu(chatId, userId);
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Git error: ${(err as Error).message}`);
    }
  }

  // ===================================================================
  //  CORE: START SESSION
  // ===================================================================

  private async handleStartSession(chatId: string, userId: string, prompt: string): Promise<void> {
    // Ensure active workspace
    let active = await this.workspaceService.getActive(userId);
    if (!active) {
      const all = await this.workspaceService.findAll(userId);
      if (all.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          'No workspaces found. Create one:\n/workspace create <name>',
        );
        return;
      }
      active = all[0] ?? null;
      if (!active) return;
      await this.workspaceService.setActive(active.id, userId);
    }

    try {
      // Create the session (spawns opencode) first
      const session = await this.sessionService.createSession({ prompt }, userId, chatId);

      // Send stream header with real session id
      await this.streamService.sendSessionStart(chatId, session.publicId, () => {
        const buf = session.terminal.buffer.active;
        const rows = session.terminal.rows;
        const start = buf.viewportY;
        const lines: string[] = [];
        for (let y = start; y < start + rows; y++) {
          const line = buf.getLine(y);
          if (line) {
            lines.push(line.translateToString().trimEnd());
          }
        }
        return lines.filter(l => l.length > 0).join('\n');
      });

      // Listen for output → stream
      session.emitter.on('output', (text: string) => {
        this.streamService.appendOutput(session.publicId, text);
      });

      // Listen for exit → end stream + show menu
      session.emitter.on('exit', (code: number | null, durationMs: number) => {
        void this.streamService.sendSessionEnd(session.publicId, code, durationMs);
        void this.showMainMenu(chatId, userId);
      });

      // Listen for errors
      session.emitter.on('error', (msg: string) => {
        void this.notificationService.sendRaw(chatId, `Session error: ${msg}`);
      });

      // Show context keyboard
      await this.showSessionContext(chatId, userId, session);

      this.logger.log(`Session ${session.publicId} started for user ${userId}`);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Session error: ${(err as Error).message}`);
    }
  }

  // ===================================================================
  //  CORE: SEND TO SESSION
  // ===================================================================

  private async handleSendToSession(chatId: string, userId: string, text: string): Promise<void> {
    // Check if user has a pending branch switch commit
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
        return;
      }
    }

    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      // No active session — start one
      await this.handleStartSession(chatId, userId, text);
      return;
    }

    try {
      await this.sessionService.sendToSession(session.id, text);
      await this.notificationService.sendRaw(chatId, `📤 Sent to session: ${text.slice(0, 200)}`);
    } catch (err) {
      // If process died, clean up and offer to start new session
      this.sessionService.cancelSession(session.id);
      await this.notificationService.sendRaw(
        chatId,
        `Session process ended. ${(err as Error).message}`,
      );
      await this.showMainMenu(chatId, userId);
    }
  }

  // ===================================================================
  //  SESSION KEYBOARD
  // ===================================================================

  private async showSessionContext(chatId: string, userId: string, session: ActiveSession): Promise<void> {
    const active = await this.workspaceService.getActive(userId);
    const projects = active ? await this.workspaceService.getProjects(active.id) : [];

    const wsLine = active ? `Workspace: ${active.name} ${active.workDir}` : 'No workspace';

    // Build project buttons
    const projButtons = projects.slice(0, 4).map((p) =>
      Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
    );

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✋ Cancel Session', cb('sess:cancel'))],
      [Markup.button.callback('📊 Git Status', cb('nav:git')), Markup.button.callback('📁 Projects', cb('nav:projects'))],
      [Markup.button.callback('📋 Workspace', cb('nav:ws'))],
      ...(projButtons.length > 0 ? [projButtons] : []),
    ]);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `🤖 *Session ${session.publicId} active*\n${wsLine}\nPrompt: ${session.prompt.slice(0, 100)}`,
      keyboard,
    );
  }

  // ===================================================================
  //  MAIN MENU
  // ===================================================================

  private async showMainMenu(chatId: string, userId: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    const active = await this.workspaceService.getActive(userId);
    const wsName = active ? `${active.name} (${active.workDir})` : 'None';

    let text = `📌 *Workspace:* ${wsName}\n`;
    if (session) {
      text += `⚡ *Session:* ${session.publicId} (active)\n\nSend text to interact, or use the buttons below.`;
    } else {
      text += `\nNo active session. Send a prompt to start one, or use the buttons below.`;
    }

    const buttons = [];
    if (session) {
      buttons.push([Markup.button.callback('✋ Cancel Session', cb('sess:cancel'))]);
    } else {
      buttons.push([Markup.button.callback('🚀 New Session', cb('sess:new'))]);
    }
    buttons.push(
      [Markup.button.callback('📊 Git', cb('nav:git')), Markup.button.callback('📁 Projects', cb('nav:projects'))],
      [Markup.button.callback('📋 Workspace', cb('nav:ws'))],
    );

    const keyboard = Markup.inlineKeyboard(buttons);

    await this.notificationService.sendRawWithKeyboard(chatId, text, keyboard);
  }

  // ===================================================================
  //  GIT MENU
  // ===================================================================

  private async showGitMenu(chatId: string, userId: string): Promise<void> {
    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    if (projects.length === 0) {
      await this.notificationService.sendRaw(chatId, 'No git projects in this workspace. Add: /project add <name> <path> [remote-url]');
      return;
    }

    // Show project selection keyboard for git operations
    const buttons = projects.slice(0, 8).map((p) => [
      Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
    ]);

    buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

    const keyboard = Markup.inlineKeyboard(buttons);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `Select a project for Git operations (workspace: ${active.name}):`,
      keyboard,
    );
  }

  // ===================================================================
  //  WORKSPACE MENU
  // ===================================================================

  private async showWorkspaceMenu(chatId: string, userId: string): Promise<void> {
    const all = await this.workspaceService.findAll(userId);
    const active = await this.workspaceService.getActive(userId);

    const buttons = all.slice(0, 8).map((w) => [
      Markup.button.callback(
        `${w.active ? '✅ ' : ''}${w.name}`,
        cb('ws:show', w.id),
      ),
    ]);

    buttons.push([Markup.button.callback('➕ New Workspace', cb('ws:create'))]);
    buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

    const keyboard = Markup.inlineKeyboard(buttons);
    const activeName = active ? active.name : 'None';

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `📋 *Workspaces*\nActive: ${activeName}\n\nTap a workspace to see details and switch:`,
      keyboard,
    );
  }

  // ===================================================================
  //  PROJECT LIST
  // ===================================================================

  private async showProjectList(chatId: string, userId: string): Promise<void> {
    const active = await this.workspaceService.getActive(userId);
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    if (projects.length === 0) {
      await this.notificationService.sendRaw(chatId, `No projects in "${active.name}".\nAdd: /project add <name> <path> [remote-url]\nExample: /project add frontend . https://github.com/org/repo.git`);
      return;
    }

    const lines = projects.slice(0, 10).map((p) => `• ${p.name} — ${'path' in p && p.path ? p.path : '.'}`);
    const buttons = projects.slice(0, 6).map((p) => [
      Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
      Markup.button.callback(`🗑️`, cb('proj:delete', p.id)),
    ]);
    buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `📁 *Projects in ${active.name}*\n${lines.join('\n')}`,
      Markup.inlineKeyboard(buttons),
    );
  }


  private async showModelPicker(chatId: string, userId: string, workspaceId: string, providerId?: string): Promise<void> {
    try {
      const loadingMsg = await this.notificationService.sendRaw(chatId, '⏳ Loading models...');
      const models = await this.workspaceService.listOpenCodeModels(workspaceId, userId, providerId);
      if (models.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          `No models found${providerId ? ` for ${providerId}` : ''}. Configure credentials first: /workspace provider <provider-id> <api-key>`,
        );
        return;
      }
      const buttons = models.slice(0, 24).map((m) => {
        // Use short numeric key to stay under Telegram's 64-byte callback limit
        const key = String(++this.modelCallbackCounter);
        this.modelCallbackStore.set(key, { workspaceId, model: m });
        return [Markup.button.callback(`🤖 ${m}`, cb('model:pick', key))];
      });
      buttons.push([Markup.button.callback('🔙 Workspace', cb('ws:show', workspaceId))]);
      await this.notificationService.sendRawWithKeyboard(
        chatId,
        `Choose the default OpenCode model for this workspace${providerId ? ` (${providerId})` : ''}:`,
        Markup.inlineKeyboard(buttons),
      );
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Model list error: ${(err as Error).message}`);
    }
  }

  private async handleModelCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    if (type === 'model:pick') {
      const entry = this.modelCallbackStore.get(value);
      if (!entry) {
        await this.notificationService.sendRaw(chatId, 'Model selection expired. Please pick again.');
        return;
      }
      this.modelCallbackStore.delete(value);
      const { workspaceId, model } = entry;
      try {
        const ws = await this.workspaceService.setDefaultModel(workspaceId, userId, model);
        await this.notificationService.sendRaw(chatId, `✅ ${ws.name} now uses ${model} by default.`);

        const state = this.setupWizardState.get(userId);
        if (state && state.step === 'models') {
          await this.handleSetupCallback(chatId, userId, 'setup:model', workspaceId);
          return;
        }

        await this.showMainMenu(chatId, userId);
      } catch (err) {
        await this.notificationService.sendRaw(chatId, `Model selection error: ${(err as Error).message}`);
      }
      return;
    }

    // Legacy format — keep for backward compatibility
    if (type !== 'model:set') return;
    const [workspaceId, ...modelParts] = value.split('|');
    const model = modelParts.join('|');
    if (!workspaceId || !model) {
      await this.notificationService.sendRaw(chatId, 'Invalid model selection.');
      return;
    }
    try {
      const ws = await this.workspaceService.setDefaultModel(workspaceId, userId, model);
      await this.notificationService.sendRaw(chatId, `✅ ${ws.name} now uses ${model} by default.`);

      // If user is in setup wizard, advance to GitHub step
      const state = this.setupWizardState.get(userId);
      if (state && state.step === 'models') {
        await this.handleSetupCallback(chatId, userId, 'setup:model', workspaceId);
        return;
      }

      await this.showMainMenu(chatId, userId);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Model selection error: ${(err as Error).message}`);
    }
  }

  // ===================================================================
  //  CALLBACK HANDLERS
  // ===================================================================

  private async handleWSCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    switch (type) {
      case 'ws:show': {
        const ws = await this.workspaceService.findById(value, userId);
        if (!ws) {
          await this.notificationService.sendRaw(chatId, 'Workspace not found.');
          return;
        }
        await this.sendWorkspaceDetails(chatId, {
          id: ws.id,
          name: ws.name,
          workDir: ws.workDir,
          active: ws.active,
          providerId: ws.providerId,
          model: ws.model,
          projects: ws.projects,
        });
        break;
      }
      case 'ws:set': {
        await this.workspaceService.setActive(value, userId);
        const ws = await this.workspaceService.findById(value, userId);
        await this.notificationService.sendRaw(chatId, `✅ Switched to "${ws?.name}"`);
        await this.showMainMenu(chatId, userId);
        break;
      }
      case 'ws:ghlogin': {
        const ws = await this.workspaceService.findById(value, userId);
        if (!ws) {
          await this.notificationService.sendRaw(chatId, 'Workspace not found.');
          return;
        }
        if (!this.githubAuthService.isConfigured()) {
          await this.notificationService.sendRaw(chatId, 'GitHub OAuth is not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).');
          return;
        }
        const url = this.githubAuthService.generateAuthUrl(userId, chatId, ws.id);
        await this.notificationService.sendRawWithKeyboard(
          chatId,
          `Click below to authorize GitHub for workspace "${ws.name}":`,
          Markup.inlineKeyboard([Markup.button.url('Authorize GitHub', url)]),
        );
        break;
      }
      case 'ws:addproj': {
        await this.notificationService.sendRaw(chatId, 'Use /project add <name> <path> [remote-url] to add a project to this workspace.\nExample: /project add frontend . https://github.com/org/repo.git');
        break;
      }
      case 'ws:create': {
        await this.notificationService.sendRaw(chatId,
          'To create a workspace, use:\n/workspace create <name>\n\nExample: /workspace create my-app');
        break;
      }
      case 'ws:rename': {
        await this.notificationService.sendRaw(chatId,
          'To rename this workspace, use:\n/workspace edit <id> name:<new-name>\n\nOr use the REST API at PUT /workspaces/:id');
        break;
      }
      case 'ws:models': {
        await this.showModelPicker(chatId, userId, value);
        break;
      }
      case 'ws:delete': {
        try {
          const ws = await this.workspaceService.findById(value, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, 'Workspace not found.');
            return;
          }
          await this.workspaceService.remove(value, userId);
          await this.notificationService.sendRaw(chatId, `🗑️ Workspace "${ws.name}" deleted.`);
          await this.showWorkspaceMenu(chatId, userId);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Delete error: ${(err as Error).message}`);
        }
        break;
      }
      default:
        await this.showWorkspaceMenu(chatId, userId);
    }
  }

  private async handleProjCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
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
          await this.showProjectList(chatId, userId);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Delete error: ${(err as Error).message}`);
        }
        break;
      }
      default:
        await this.showProjectList(chatId, userId);
    }
  }

  private async handleGitCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
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
          await this.gitCommandsService.push(project.gitPath);
          await this.notificationService.sendRaw(chatId, `✅ Pushed (${project.name})`);
          break;
        }
        case 'git:pull': {
          await this.gitCommandsService.pull(project.gitPath);
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

  private async handleBranchCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
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
          // Store pending branch switch in user state
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

  // Map for pending branch switches: key=`${userId}:${projectId}` → targetBranch
  private readonly pendingBranchSwitches = new Map<string, string>();

  // Map for model picker callbacks (stores full data, callback passes a short key)
  // key is a counter-based short ID, value is { workspaceId, model }
  private modelCallbackStore = new Map<string, { workspaceId: string; model: string }>();
  private modelCallbackCounter = 0;

  // ===================================================================
  //  SETUP WIZARD
  // ===================================================================

  private readonly setupWizardState = new Map<string, {
    step: 'provider' | 'api-key' | 'models' | 'github';
    workspaceId: string;
    providerId?: string;
  }>();

  async handleSetupCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    let active = await this.workspaceService.getActive(userId);
    if (!active) {
      const all = await this.workspaceService.findAll(userId);
      if (all.length === 0) {
        await this.notificationService.sendRaw(chatId, 'No workspace yet. Create one first: /workspace create <name>\nThen run /setup to configure it.');
        return;
      }
      active = all[0]!;
      await this.workspaceService.setActive(active.id, userId);
    }

    // Step 1: Pick a provider
    this.setupWizardState.set(userId, { step: 'provider', workspaceId: active.id });
    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `🚀 *Setup Wizard — Step 1/4*\nWorkspace: *${active.name}*\n\nChoose an AI provider:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔵 OpenCode Zen/Go', cb('setup:provider', 'opencode'))],
        [Markup.button.callback('🟢 OpenAI', cb('setup:provider', 'openai'))],
        [Markup.button.callback('🟣 Anthropic Claude', cb('setup:provider', 'anthropic'))],
        [Markup.button.callback('⚫ GitHub Copilot', cb('setup:provider', 'github-copilot'))],
        [Markup.button.callback('🔙 Cancel', cb('setup:cancel'))],
      ]),
    );
  }

  private async handleSetupCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    const state = this.setupWizardState.get(userId);
    if (!state) {
      await this.notificationService.sendRaw(chatId, 'Setup session expired. Run /setup again.');
      return;
    }

    switch (type) {
      case 'setup:provider': {
        state.step = 'api-key';
        state.providerId = value;
        const keyName = value === 'opencode' ? 'OpenCode API key' : `${value} API key`;
        const keyHint = value === 'opencode'
          ? 'Get it at https://opencode.ai/auth'
          : `Get it from the ${value} dashboard`;
        await this.notificationService.sendRaw(
          chatId,
          `📋 *Setup — Step 2/4*\nProvider: *${value}*\n\nEnter your ${keyName}:\n${keyHint}\n\nSend the API key as a message.`,
        );
        break;
      }
      case 'setup:apikey': {
        // API key was received via text, stored in value
        state.step = 'models';
        await this.notificationService.sendRaw(chatId, 'Configuring provider...');
        try {
          const updated = await this.workspaceService.configureProvider(
            state.workspaceId, userId, state.providerId ?? '', value,
          );
          await this.notificationService.sendRaw(chatId, `✅ Provider "${state.providerId}" configured.\n\nStep 3: Pick a model...`);
          // List models
          await this.showModelPicker(chatId, userId, state.workspaceId, state.providerId);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `❌ Provider config failed: ${(err as Error).message}\nRun /setup to try again.`);
          this.setupWizardState.delete(userId);
        }
        break;
      }
      case 'setup:model': {
        // Model was selected via the model picker callback — already handled by handleModelCallback
        state.step = 'github';
        await this.notificationService.sendRawWithKeyboard(
          chatId,
          '✅ Model selected!\n\n*Step 4/4: GitHub Login (optional)*\n\nConnect GitHub to manage repositories and create PRs.',
          Markup.inlineKeyboard([
            [Markup.button.callback('🔑 GitHub Login', cb('setup:github', state.workspaceId))],
            [Markup.button.callback('⏭ Skip', cb('setup:done', ''))],
          ]),
        );
        break;
      }
      case 'setup:github': {
        if (!this.githubAuthService.isConfigured()) {
          await this.notificationService.sendRaw(chatId, 'GitHub OAuth not configured. Skipping...\n\n✅ *Setup complete!* Next: /project add <name> <path> <remote-url>');
          this.setupWizardState.delete(userId);
          return;
        }
        const url = this.githubAuthService.generateAuthUrl(userId, chatId, state.workspaceId);
        await this.notificationService.sendRawWithKeyboard(
          chatId,
          'Click below to authorize GitHub:',
          Markup.inlineKeyboard([Markup.button.url('🔑 Authorize GitHub', url)]),
        );
        // Don't clear state yet — wait for callback
        break;
      }
      case 'setup:done': {
        await this.notificationService.sendRaw(chatId, '✅ *Setup complete!*\n\nTry:\n  /project add <name> <path> <remote-url>\n  Or just send a prompt to start a session.');
        this.setupWizardState.delete(userId);
        break;
      }
      case 'setup:cancel': {
        await this.notificationService.sendRaw(chatId, 'Setup cancelled.');
        this.setupWizardState.delete(userId);
        break;
      }
    }
  }

  private async handleSessCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    switch (type) {
      case 'sess:show': {
        const session = this.sessionService.getActiveSession(value);
        if (session) {
          await this.streamService.showSessionOutput(
            chatId,
            session.publicId,
            session.outputBuffer,
            session.running,
          );
        } else {
          await this.notificationService.sendRaw(chatId, 'Session not found.');
        }
        break;
      }
      case 'sess:cancel': {
        const targetId = value || this.sessionService.getUserSession(userId)?.id || '';
        if (targetId) {
          this.sessionService.cancelSession(targetId);
          await this.notificationService.sendRaw(chatId, `🛑 Session cancelled.`);
        }
        await this.showMainMenu(chatId, userId);
        break;
      }
      case 'sess:switch': {
        if (value) {
          const ok = this.sessionService.switchUserSession(userId, value);
          if (ok) {
            const session = this.sessionService.getActiveSession(value);
            if (session) {
              await this.notificationService.sendRaw(chatId, `👉 Switched to session ${session.publicId}`);
              await this.showSessionContext(chatId, userId, session);
            }
          } else {
            await this.notificationService.sendRaw(chatId, 'Session not found.');
          }
        }
        break;
      }
      case 'sess:new': {
        await this.notificationService.sendRaw(chatId, 'Send a prompt and I\'ll start a new session.');
        break;
      }
    }
  }

  // ===================================================================
  //  HELPERS
  // ===================================================================

  private async sendWorkspaceDetails(
    chatId: string,
    ws: { id: string; name: string; workDir: string; active: boolean; providerId?: string | null; model?: string | null; projects: Array<{ id: string; name: string; gitPath: string; branch: string; path?: string }> },
  ): Promise<void> {
    const projList = ws.projects.map((p) => `• ${p.name} — ${p.path ?? '.'}`).join('\n') || '  No projects';

    // Build button rows, filtering out null entries (important: [null] breaks Telegraf!)
    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

    rows.push([
      Markup.button.callback('📁 Add Project', cb('ws:addproj', ws.id)),
      Markup.button.callback('🤖 Pick Model', cb('ws:models', ws.id)),
    ]);

    if (!ws.active) {
      rows.push([Markup.button.callback('✅ Set Active', cb('ws:set', ws.id))]);
    }
    rows.push([
      Markup.button.callback('✏️ Rename', cb('ws:rename', ws.id)),
      Markup.button.callback('🗑️ Delete', cb('ws:delete', ws.id)),
    ]);
    rows.push([Markup.button.callback('🔙 Workspaces', cb('nav:ws'))]);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `📋 *${ws.name}*${ws.active ? ' (active)' : ''}\nPath: ${ws.workDir}\nProvider: ${ws.providerId ?? 'not configured'}\nModel: ${ws.model ?? 'not selected'}\n\nProjects:\n${projList}`,
      Markup.inlineKeyboard(rows),
    );
  }

  // ===================================================================
  //  SESSIONS COMMAND
  // ===================================================================

  async handleSessionsCmd(ctx: TelegramContext): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const userSessions = this.sessionService.getUserSessions(userId);
    const active = this.sessionService.getUserSession(userId);

    if (userSessions.length === 0) {
      await this.notificationService.sendRaw(chatId, 'No sessions. Send a prompt to start one.');
      return;
    }

    const lines = userSessions.map((s) => {
      const isActive = active && (active.id === s.id || active.publicId === s.publicId);
      const procStatus = s.running ? `PID ${s.pid ?? '?'}` : 'stopped';
      return `${isActive ? '👉 ' : '  '}${s.publicId} | ${procStatus} | ${s.workspaceName} | ${s.prompt.slice(0, 40)}`;
    });

    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

    for (const s of userSessions) {
      const isActive = active && (active.id === s.id || active.publicId === s.publicId);
      const btns: Array<ReturnType<typeof Markup.button.callback>> = [];
      btns.push(Markup.button.callback(`📋 Show ${s.publicId}`, cb('sess:show', s.id)));
      if (!isActive) {
        btns.push(Markup.button.callback(`👉 Switch`, cb('sess:switch', s.id)));
      }
      btns.push(Markup.button.callback(`❌ Close`, cb('sess:cancel', s.id)));
      rows.push(btns);
    }
    rows.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

    await this.notificationService.sendRawWithKeyboard(
      chatId,
      `📋 *Your Sessions*\n${lines.join('\n')}`,
      Markup.inlineKeyboard(rows),
    );
  }

  async handleHelp(ctx: TelegramContext): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    await this.notificationService.sendRaw(chatId,
      [
      '🤖 *OpenCode Bot*',
      '',
      'Just type a prompt to start an interactive session.',
      'Output streams live to Telegram.',
      '',
      '*Session*',
      '/session <prompt> — Start session',
      '/send <text> — Send text to active session',  
      '/sessions — List / switch sessions',
      '/cancel — Cancel session',
      '',
      '*Terminal Keys*',
      '/tab — Tab (autocomplete)',
      '/enter — Enter (confirm)',
      '/up — Arrow Up',
      '/down — Arrow Down',
      '/ctrl_c — Interrupt (Ctrl+C)',
      '',
      '*OpenCode Control*',
      '/model <name> — Switch model',
      '/skill <name> — Load skill',
      '',
      '*Git*',
      '/git status/diff/add/commit/push/pull/log',
      '',
      '*Workspace*',
      '/workspace create <name> / list / switch / show',
      '/project add/list/edit/delete',
      ].join('\n'),
    );
  }

  // ===================================================================
  //  TERMINAL KEY COMMANDS
  // ===================================================================

  /** /tab, /up, /down, /enter, /ctrl_c — send special keypress to PTY. */
  async handleKeyCmd(ctx: TelegramContext, key: string): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    try {
      this.sessionService.sendKey(session.id, key);
      await this.notificationService.sendRaw(chatId, `⌨️ Sent: ${key}`);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Key error: ${(err as Error).message}`);
    }
  }

  /** Handle inline keyboard key press from the session hint message. */
  private async handleKeyAction(chatId: string, userId: string, key: string): Promise<void> {
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      await this.notificationService.sendRaw(chatId, 'No active session.');
      return;
    }

    try {
      this.sessionService.sendKey(session.id, key);
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Key error: ${(err as Error).message}`);
    }
  }
}
