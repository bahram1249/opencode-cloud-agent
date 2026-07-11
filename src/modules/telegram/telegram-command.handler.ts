import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { TelegramContext } from './telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { SessionService, type ActiveSession } from 'src/modules/session/session.service';
import { StreamService } from 'src/modules/stream/stream.service';
import { GitCommandsService } from 'src/modules/git-commands/git-commands.service';

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
        await this.showWorkspaceMenu(chatId);
        break;
      case 'projects':
        await this.showProjectList(chatId, userId);
        break;
    }
  }

  // ===================================================================
  //  MAIN SESSION / SEND HANDLERS
  // ===================================================================

  /** Called when user sends plain text. Routes to session or starts one. */
  async handleTextInput(chatId: string, userId: string, text: string): Promise<void> {
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

    if (args.length === 0) {
      await this.showWorkspaceMenu(chatId);
      return;
    }

    const action = args[0].toLowerCase();
    const rest = args.slice(1).join(' ');

    try {
      switch (action) {
        case 'create':
        case 'new': {
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace create <name> <path>');
            return;
          }
          const ws = await this.workspaceService.create({ name: parts[0], workDir: parts.slice(1).join(' ') });
          await this.notificationService.sendRaw(chatId, `✅ Workspace "${ws.name}" created at ${ws.workDir}`);
          break;
        }
        case 'switch': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace switch <name>');
            return;
          }
          const ws = await this.workspaceService.findByName(rest);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found.`);
            return;
          }
          await this.workspaceService.setActive(ws.id);
          await this.notificationService.sendRaw(chatId, `✅ Switched to workspace "${ws.name}"`);
          break;
        }
        case 'list':
        case 'ls': {
          const list = await this.workspaceService.findAll();
          if (list.length === 0) {
            await this.notificationService.sendRaw(chatId, 'No workspaces. Create: /workspace create <name> <path>');
            return;
          }
          const lines = list.map((w) => `• ${w.name}${w.active ? ' (active)' : ''} — ${w.workDir}`);
          await this.notificationService.sendRaw(chatId, `Workspaces:\n${lines.join('\n')}`);
          return;
        }
        case 'show':
        case 'current': {
          const active = await this.workspaceService.getActive();
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
          const ws = await this.workspaceService.findByName(editParts[1]);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${editParts[1]}" not found.`);
            return;
          }
          await this.workspaceService.update(ws.id, { name: editParts[2] });
          await this.notificationService.sendRaw(chatId, `✅ Workspace renamed to "${editParts[2]}"`);
          break;
        }
        case 'delete':
        case 'rm':
        case 'remove': {
          const ws = await this.workspaceService.findByName(rest);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, `Workspace "${rest}" not found.`);
            return;
          }
          await this.workspaceService.remove(ws.id);
          await this.notificationService.sendRaw(chatId, `🗑️ Workspace "${ws.name}" deleted.`);
          break;
        }
        default:
          await this.showWorkspaceMenu(chatId);
          return;
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Error: ${(err as Error).message}`);
      return;
    }

    await this.showWorkspaceMenu(chatId);
  }

  // ===================================================================
  //  PROJECT COMMANDS
  // ===================================================================

  async handleProjectCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    const active = await this.workspaceService.getActive();
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

    try {
      switch (action) {
        case 'add':
        case 'new': {
          if (!rest) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project add <name> <git-path>\nThe git path must be an existing directory inside the active workspace.');
            return;
          }
          const parts = rest.split(' ').filter(Boolean);
          if (parts.length < 2) {
            await this.notificationService.sendRaw(chatId, 'Usage: /project add <name> <path>');
            return;
          }
          const proj = await this.workspaceService.addProject(active.id, {
            name: parts[0],
            gitPath: parts.slice(1).join(' '),
          });
          await this.notificationService.sendRaw(chatId, `✅ Project "${proj.name}" added at ${proj.gitPath}`);
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
            await this.workspaceService.updateProject(project.id, { gitPath: change.slice(5) });
            await this.notificationService.sendRaw(chatId, `✅ Project path updated`);
          } else {
            // Treat as rename for convenience
            await this.workspaceService.updateProject(project.id, { name: change });
            await this.notificationService.sendRaw(chatId, `✅ Project renamed to "${change}"`);
          }
          await this.showProjectList(chatId, userId);
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
    const active = await this.workspaceService.getActive();
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

    if (!gitPath || !this.gitCommandsService.validateRepo(gitPath)) {
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
    let active = await this.workspaceService.getActive();
    if (!active) {
      const all = await this.workspaceService.findAll();
      if (all.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          'No workspaces found. Create one:\n/workspace create <name> <path>',
        );
        return;
      }
      active = all[0] ?? null;
      if (!active) return;
      await this.workspaceService.setActive(active.id);
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
    const session = this.sessionService.getUserSession(userId);
    if (!session) {
      // No active session — start one
      await this.handleStartSession(chatId, userId, text);
      return;
    }

    try {
      this.sessionService.sendToSession(session.id, text);
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
    const active = await this.workspaceService.getActive();
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
    const active = await this.workspaceService.getActive();
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

  private async showGitMenu(chatId: string, _userId: string): Promise<void> {
    const active = await this.workspaceService.getActive();
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    if (projects.length === 0) {
      await this.notificationService.sendRaw(chatId, 'No git projects in this workspace. Add: /project add <name> <path>');
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

  private async showWorkspaceMenu(chatId: string): Promise<void> {
    const all = await this.workspaceService.findAll();
    const active = await this.workspaceService.getActive();

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

  private async showProjectList(chatId: string, _userId: string): Promise<void> {
    const active = await this.workspaceService.getActive();
    if (!active) {
      await this.notificationService.sendRaw(chatId, 'No active workspace.');
      return;
    }

    const projects = await this.workspaceService.getProjects(active.id);
    if (projects.length === 0) {
      await this.notificationService.sendRaw(chatId, `No projects in "${active.name}".\nAdd: /project add <name> <git-path>`);
      return;
    }

    const lines = projects.slice(0, 10).map((p) => `• ${p.name} (${p.branch}) — ${p.gitPath}`);
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

  // ===================================================================
  //  CALLBACK HANDLERS
  // ===================================================================

  private async handleWSCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    switch (type) {
      case 'ws:show': {
        const ws = await this.workspaceService.findById(value);
        if (!ws) {
          await this.notificationService.sendRaw(chatId, 'Workspace not found.');
          return;
        }
        await this.sendWorkspaceDetails(chatId, {
          id: ws.id,
          name: ws.name,
          workDir: ws.workDir,
          active: ws.active,
          projects: ws.projects,
        });
        break;
      }
      case 'ws:set': {
        await this.workspaceService.setActive(value);
        const ws = await this.workspaceService.findById(value);
        await this.notificationService.sendRaw(chatId, `✅ Switched to "${ws?.name}"`);
        await this.showMainMenu(chatId, userId);
        break;
      }
      case 'ws:addproj': {
        await this.notificationService.sendRaw(chatId, 'Use /project add <name> <git-path> to add a project to this workspace.');
        break;
      }
      case 'ws:create': {
        await this.notificationService.sendRaw(chatId,
          'To create a workspace, use:\n/workspace create <name> <path>\n\nExample: /workspace create my-app /Users/me/projects/my-app');
        break;
      }
      case 'ws:rename': {
        await this.notificationService.sendRaw(chatId,
          'To rename this workspace, use:\n/workspace edit <id> name:<new-name>\n\nOr use the REST API at PUT /workspaces/:id');
        break;
      }
      case 'ws:delete': {
        try {
          const ws = await this.workspaceService.findById(value);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, 'Workspace not found.');
            return;
          }
          await this.workspaceService.remove(value);
          await this.notificationService.sendRaw(chatId, `🗑️ Workspace "${ws.name}" deleted.`);
          await this.showWorkspaceMenu(chatId);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Delete error: ${(err as Error).message}`);
        }
        break;
      }
      default:
        await this.showWorkspaceMenu(chatId);
    }
  }

  private async handleProjCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    const project = await this.workspaceService.findProjectById(value);

    if (!project) {
      await this.notificationService.sendRaw(chatId, 'Project not found.');
      return;
    }

    if (!this.gitCommandsService.validateRepo(project.gitPath)) {
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
            `📊 *${project.name}* — ${project.gitPath}\nBranch: ${s.branch}\n${s.clean ? '✅ Clean' : `📝 Changes:\n${files}`}`,
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
    ws: { id: string; name: string; workDir: string; active: boolean; projects: Array<{ id: string; name: string; gitPath: string; branch: string }> },
  ): Promise<void> {
    const projList = ws.projects.map((p) => `• ${p.name} (${p.branch}) — ${p.gitPath}`).join('\n') || '  No projects';

    // Build button rows, filtering out null entries (important: [null] breaks Telegraf!)
    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

    rows.push([Markup.button.callback('📁 Add Project', cb('ws:addproj', ws.id))]);

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
      `📋 *${ws.name}*${ws.active ? ' (active)' : ''}\nPath: ${ws.workDir}\n\nProjects:\n${projList}`,
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
      '/workspace create/list/switch/show',
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
