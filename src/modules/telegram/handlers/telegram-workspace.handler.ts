import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { GitAuthService } from 'src/modules/git-auth/git-auth.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { showMainMenu, showWorkspaceMenu, showWorkspaceSettings, type MenuServices } from '../ui/telegram-menus';
import { cb } from '../utils/telegram-callback.utils';

@Injectable()
export class TelegramWorkspaceHandler {
  private readonly logger = new Logger(TelegramWorkspaceHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly gitAuthService: GitAuthService,
  ) {}

  refWs(wsId: string): string {
    const key = String(++this.wsRefCounter);
    this.wsRefStore.set(key, wsId);
    return key;
  }

  resolveWs(ref: string): string | undefined {
    return this.wsRefStore.get(ref);
  }

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: null as never,
      refWs: (wsId: string) => this.refWs(wsId),
    };
  }

  modelCallbackStore = new Map<string, { workspaceId: string; model: string }>();
  modelCallbackCounter = 0;

  wsRefStore = new Map<string, string>();
  wsRefCounter = 0;

  async handleWorkspaceCmd(chatId: string, userId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      await showWorkspaceMenu(chatId, userId, this.menuSvc);
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
              'Then run /setup or navigate to Workspace → tap workspace to configure:\n' +
              '  - Set provider and API key\n' +
              '  - Pick a default model\n' +
              '  - Add git projects\n' +
              '  - Configure git credentials',
            );
            return;
          }
          const ws = await this.workspaceService.create({ name: rest }, userId);
          await this.notificationService.sendRaw(chatId, `✅ Workspace "${ws.name}" created.\nNext: /setup or tap 📋 Workspace → tap "${ws.name}" to configure.`);
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
          await this.notificationService.sendRaw(
            chatId,
            `📋 *${active.name}*\nPath: ${active.workDir}\nProvider: ${active.providerId ?? 'not configured'}\nModel: ${active.model ?? 'not selected'}\n\nOpen Settings from the workspace list: /workspace or tap 📋 Workspace.`,
          );
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
              '  opencode      — OpenCode Zen (pay-as-you-go, https://opencode.ai/auth)\n' +
              '  opencode-go   — OpenCode Go (subscription, https://opencode.ai/auth)\n' +
              '  openai        — OpenAI models\n' +
              '  anthropic     — Anthropic Claude\n' +
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
          await this.notificationService.sendRaw(chatId, `✅ Provider "${parts[0]}" configured for "${updated.name}".\nManage in Settings: tap 📋 Workspace → tap workspace → Change Provider/Model.`);
          break;
        }
        case 'models': {
          const active = await this.workspaceService.getActive(userId);
          if (!active) {
            await this.notificationService.sendRaw(chatId, 'No active workspace. Create or switch workspace first.');
            return;
          }
          await this.showModelPicker(chatId, userId, 0, active.id, rest || active.providerId || undefined);
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
        case 'github-token':
        case 'gh-token': {
          const token = rest.trim();
          if (!token) {
            await this.notificationService.sendRaw(chatId, 'Usage: /workspace github-token <token>\nGet a token from your git provider.\nRecommended: /git login <username> <token> <remote-url>');
            return;
          }
          await this.notificationService.sendRaw(chatId, 'Use /git login instead:\n/git login <username> <token> <remote-url>\n\nExample:\n/git login myuser <token> https://github.com/org/repo.git');
          return;
        }
        case 'github-login':
        case 'gh-login': {
          await this.notificationService.sendRaw(
            chatId,
            'GitHub OAuth has been removed. Use:\n/git login <username> <token> <remote-url>\n\n' +
            'Example:\n/git login myuser ghp_abc123 https://github.com/org/repo.git',
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
          await showWorkspaceMenu(chatId, userId, this.menuSvc);
          return;
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Error: ${(err as Error).message}`);
      return;
    }

    await showWorkspaceMenu(chatId, userId, this.menuSvc);
  }

  async handleWSCallback(chatId: string, userId: string, messageId: number, type: string, value: string): Promise<void> {
    const resolved = this.resolveWs(value) ?? value;

    switch (type) {
      case 'ws:show':
      case 'ws:setting:back': {
        const ws = await this.workspaceService.findById(resolved, userId);
        if (!ws) {
          await this.notificationService.sendRaw(chatId, 'Workspace not found.');
          return;
        }
        await showWorkspaceSettings(chatId, messageId, {
          id: ws.id,
          name: ws.name,
          workDir: ws.workDir,
          active: ws.active,
          providerId: ws.providerId,
          model: ws.model,
          projects: ws.projects,
          gitToken: ws.gitToken,
          gitUsername: ws.gitUsername,
          sessionCount: ws._count?.sessions ?? 0,
        }, this.menuSvc);
        break;
      }
      case 'ws:set': {
        await this.workspaceService.setActive(resolved, userId);
        const ws = await this.workspaceService.findById(resolved, userId);
        await this.notificationService.sendRaw(chatId, `✅ Switched to "${ws?.name}"`);
        await showMainMenu(chatId, userId, this.menuSvc);
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
        await this.showModelPicker(chatId, userId, messageId, resolved, undefined, 1);
        break;
      }
      case 'ws:setting:provider': {
        await this.showProviderPicker(chatId, userId, messageId, resolved);
        break;
      }
      case 'ws:setting:projects': {
        await this.showProjectManagement(chatId, userId, messageId, resolved);
        break;
      }
      case 'ws:setting:git': {
        await this.showGitManagement(chatId, userId, messageId, resolved);
        break;
      }
      case 'ws:setting:sessions': {
        await this.showSessionManagement(chatId, userId, messageId, resolved);
        break;
      }
      case 'ws:pickprovider': {
        await this.handleProviderPickCallback(chatId, userId, messageId, value);
        break;
      }
      case 'ws:gitlogout': {
        try {
          await this.gitAuthService.removeCredentials(resolved);
          await this.notificationService.sendRaw(chatId, '✅ Git credentials cleared.');
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `❌ Error: ${(err as Error).message}`);
        }
        break;
      }
      case 'ws:delete': {
        try {
          const ws = await this.workspaceService.findById(resolved, userId);
          if (!ws) {
            await this.notificationService.sendRaw(chatId, 'Workspace not found.');
            return;
          }
          await this.workspaceService.remove(resolved, userId);
          await this.notificationService.sendRaw(chatId, `🗑️ Workspace "${ws.name}" deleted.`);
          await showWorkspaceMenu(chatId, userId, this.menuSvc);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Delete error: ${(err as Error).message}`);
        }
        break;
      }
      default:
        await showWorkspaceMenu(chatId, userId, this.menuSvc);
    }
  }

  modelPageStore = new Map<string, { workspaceId: string; page: number; totalPages: number }>();

  async showModelPicker(chatId: string, userId: string, messageId: number, workspaceId: string, providerId?: string, page = 1): Promise<void> {
    try {
      const models = await this.workspaceService.listOpenCodeModels(workspaceId, userId, providerId);
      if (models.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          `No models found${providerId ? ` for ${providerId}` : ''}. Configure credentials first: /workspace provider <provider-id> <api-key>`,
        );
        return;
      }
      const pageSize = 8;
      const totalPages = Math.ceil(models.length / pageSize);
      const currentPage = Math.max(1, Math.min(page, totalPages));
      const startIdx = (currentPage - 1) * pageSize;
      const pageModels = models.slice(startIdx, startIdx + pageSize);

      const paginationKey = `${chatId}:${workspaceId}`;
      this.modelPageStore.set(paginationKey, { workspaceId, page: currentPage, totalPages });

      const wsRef = this.refWs(workspaceId);
      const buttons: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];
      for (const m of pageModels) {
        const key = String(++this.modelCallbackCounter);
        this.modelCallbackStore.set(key, { workspaceId, model: m });
        buttons.push([Markup.button.callback(`🤖 ${m}`, cb('model:pick', key))]);
      }

      const navRow: Array<ReturnType<typeof Markup.button.callback>> = [];
      if (currentPage > 1) {
        navRow.push(Markup.button.callback('◀ Prev', cb('model:pp', wsRef)));
      }
      navRow.push(Markup.button.callback(`Page ${currentPage}/${totalPages}`, cb('model:nop', '')));
      if (currentPage < totalPages) {
        navRow.push(Markup.button.callback('Next ▶', cb('model:np', wsRef)));
      }
      buttons.push(navRow);
      buttons.push([
        Markup.button.callback('❓ Help', cb('help:model-picker')),
        Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef)),
      ]);

      const text = `Choose the default OpenCode model for this workspace${providerId ? ` (${providerId})` : ''}:`;
      if (messageId > 0) {
        await this.notificationService.editMessage(chatId, messageId, text, Markup.inlineKeyboard(buttons));
      } else {
        await this.notificationService.sendRawWithKeyboard(chatId, text, Markup.inlineKeyboard(buttons));
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `Model list error: ${(err as Error).message}`);
    }
  }

  async handleModelCallback(chatId: string, userId: string, messageId: number, type: string, value: string): Promise<void> {
    switch (type) {
      case 'model:pick': {
        const entry = this.modelCallbackStore.get(value);
        if (!entry) {
          await this.notificationService.sendRaw(chatId, 'Model selection expired. Please pick again.');
          return;
        }
        this.modelCallbackStore.delete(value);
        const { workspaceId, model } = entry;
        try {
          await this.workspaceService.setDefaultModel(workspaceId, userId, model);
          const fullWs = await this.workspaceService.findById(workspaceId, userId);
          if (fullWs) {
            await showWorkspaceSettings(chatId, messageId, {
              id: fullWs.id,
              name: fullWs.name,
              workDir: fullWs.workDir,
              active: fullWs.active,
              providerId: fullWs.providerId,
              model: fullWs.model,
              projects: fullWs.projects,
              gitToken: fullWs.gitToken,
              gitUsername: fullWs.gitUsername,
              sessionCount: fullWs._count?.sessions ?? 0,
            }, this.menuSvc);
          }
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `Model selection error: ${(err as Error).message}`);
        }
        return;
      }
      case 'model:np': {
        const npWsId = this.resolveWs(value) ?? value;
        const npKey = `${chatId}:${npWsId}`;
        const npState = this.modelPageStore.get(npKey);
        if (npState) {
          await this.showModelPicker(chatId, userId, messageId, npWsId, undefined, npState.page + 1);
        }
        return;
      }
      case 'model:pp': {
        const ppWsId = this.resolveWs(value) ?? value;
        const ppKey = `${chatId}:${ppWsId}`;
        const ppState = this.modelPageStore.get(ppKey);
        if (ppState) {
          await this.showModelPicker(chatId, userId, messageId, ppWsId, undefined, ppState.page - 1);
        }
        return;
      }
    }
  }

  pickProviderStore = new Map<string, { workspaceId: string; providerId: string }>();
  pickProviderCounter = 0;

  async showProviderPicker(chatId: string, userId: string, messageId: number, workspaceId: string): Promise<void> {
    const ws = await this.workspaceService.findById(workspaceId, userId);
    const currentProvider = ws?.providerId ?? 'none';
    const wsRef = this.refWs(workspaceId);

    const providers = ['opencode', 'opencode-go', 'openai', 'anthropic', 'github-copilot'];
    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];
    for (const p of providers) {
      const pickKey = String(++this.pickProviderCounter);
      this.pickProviderStore.set(pickKey, { workspaceId, providerId: p });
      rows.push([Markup.button.callback(
        p === 'opencode' ? '🔵 OpenCode Zen' :
        p === 'opencode-go' ? '🟢 OpenCode Go' :
        p === 'openai' ? '🟢 OpenAI' :
        p === 'anthropic' ? '🟣 Anthropic Claude' : '⚫ GitHub Copilot',
        cb('ws:pickprovider', pickKey),
      )]);
    }
    rows.push([Markup.button.callback('❓ Help', cb('help:provider-picker'))]);
    rows.push([Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef))]);

    await this.notificationService.editMessage(
      chatId,
      messageId,
      `🔵 *Select Provider*\nWorkspace: *${ws?.name}*\nCurrent: ${currentProvider}\n\nChoose an AI provider:`,
      Markup.inlineKeyboard(rows),
    );
  }

  async handleProviderPickCallback(chatId: string, userId: string, messageId: number, value: string): Promise<void> {
    const entry = this.pickProviderStore.get(value);
    if (!entry) return;
    this.pickProviderStore.delete(value);
    const { workspaceId, providerId } = entry;
    const wsRef = this.refWs(workspaceId);
    this.pendingApiKeyInput.set(`${chatId}:${userId}`, { workspaceId, providerId });

    await this.notificationService.editMessage(
      chatId,
      messageId,
      `📋 *Set API Key*\nProvider: *${providerId}*\n\nEnter your ${providerId} API key:\n${
        providerId === 'opencode'
          ? 'Get it at https://opencode.ai/auth'
          : `Get it from the ${providerId} dashboard`
      }\n\nSend the API key as a message.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef))],
      ]),
    );
  }

  pendingApiKeyInput = new Map<string, { workspaceId: string; providerId: string }>();

  async handleApiKeyText(chatId: string, userId: string, text: string): Promise<boolean> {
    const key = `${chatId}:${userId}`;
    const pending = this.pendingApiKeyInput.get(key);
    if (!pending) return false;

    this.pendingApiKeyInput.delete(key);
    try {
      await this.workspaceService.configureProvider(pending.workspaceId, userId, pending.providerId, text);
      const ws = await this.workspaceService.findById(pending.workspaceId, userId);
      if (ws) {
        await this.notificationService.sendRaw(
          chatId,
          `✅ Provider "${pending.providerId}" configured for "${ws.name}".\n\nOpen workspace settings:`,
        );
        const wsRef = this.refWs(pending.workspaceId);
        const text = `🔵 *Provider Updated*\nWorkspace: *${ws.name}*\nProvider: *${pending.providerId}*\n\nOpen settings to change model or manage projects.`;
        await this.notificationService.sendRawWithKeyboard(
          chatId,
          text,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Workspace Settings', cb('ws:show', wsRef))],
          ]),
        );
      } else {
        await this.notificationService.sendRaw(chatId, `✅ Provider "${pending.providerId}" configured.`);
      }
    } catch (err) {
      await this.notificationService.sendRaw(chatId, `❌ Provider config failed: ${(err as Error).message}`);
    }
    return true;
  }

  async showProjectManagement(chatId: string, userId: string, messageId: number, workspaceId: string): Promise<void> {
    const ws = await this.workspaceService.findById(workspaceId, userId);
    const projects = ws?.projects ?? [];
    const lines = projects.map((p) => `• ${p.name} — ${p.path ?? '.'}`).join('\n') || '  No projects';
    const wsRef = this.refWs(workspaceId);

    const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];
    for (const p of projects.slice(0, 6)) {
      rows.push([
        Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
        Markup.button.callback(`🗑️`, cb('proj:delete', p.id)),
      ]);
    }
    rows.push([Markup.button.callback('➕ Add Project', cb('ws:addproj', wsRef))]);
    rows.push([
      Markup.button.callback('❓ Help', cb('help:project-list')),
      Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef)),
    ]);

    await this.notificationService.editMessage(
      chatId,
      messageId,
      `📁 *Projects in ${ws?.name ?? 'workspace'}*\n${lines}`,
      Markup.inlineKeyboard(rows),
    );
  }

  async showGitManagement(chatId: string, userId: string, messageId: number, workspaceId: string): Promise<void> {
    const ws = await this.workspaceService.findById(workspaceId, userId);
    const hasGit = !!(ws?.gitToken && ws?.gitUsername);
    const gitStatus = hasGit
      ? `✅ Logged in as ${ws.gitUsername} (${(ws.gitToken ?? '').slice(0, 4)}****${(ws.gitToken ?? '').slice(-4)})`
      : '🔑 Not configured';
    const wsRef = this.refWs(workspaceId);

    await this.notificationService.editMessage(
      chatId,
      messageId,
      `🔑 *Git Credentials*\nWorkspace: *${ws?.name}*\n\nStatus: ${gitStatus}\n\n${
        hasGit
          ? 'You can log out or test your credentials below.'
          : 'Set credentials via:\n  /git login <username> <token> <remote-url>'
      }`,
      Markup.inlineKeyboard([
        ...(hasGit
          ? [[Markup.button.callback('🚪 Logout', cb('ws:gitlogout', wsRef))]]
          : ([] as Array<Array<ReturnType<typeof Markup.button.callback>>>)),
        [Markup.button.callback('❓ Help', cb('help:git-manage')),
         Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef))],
      ]),
    );
  }

  async showSessionManagement(chatId: string, userId: string, messageId: number, workspaceId: string): Promise<void> {
    const ws = await this.workspaceService.findById(workspaceId, userId);
    const sessionCount = ws?._count?.sessions ?? 0;
    const wsRef = this.refWs(workspaceId);

    await this.notificationService.editMessage(
      chatId,
      messageId,
      `⚡ *Sessions*\nWorkspace: *${ws?.name}*\n\nTotal sessions: ${sessionCount}\n\nUse /sessions to list all sessions.\nSend a prompt to start a new session.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🚀 New Session', cb('sess:new'))],
        [Markup.button.callback('❓ Help', cb('help:session-list')),
         Markup.button.callback('🔙 Settings', cb('ws:setting:back', wsRef))],
      ]),
    );
  }
}
