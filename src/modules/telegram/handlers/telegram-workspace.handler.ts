import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { showMainMenu, showWorkspaceMenu, sendWorkspaceDetails, type MenuServices } from '../ui/telegram-menus';
import { cb } from '../utils/telegram-callback.utils';

@Injectable()
export class TelegramWorkspaceHandler {
  private readonly logger = new Logger(TelegramWorkspaceHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: null as never,
    };
  }

  modelCallbackStore = new Map<string, { workspaceId: string; model: string }>();
  modelCallbackCounter = 0;

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
              'Then configure a provider:\n' +
              '  /workspace provider <id> <api-key>\n' +
              '  Common provider IDs: opencode, openai, anthropic\n\n' +
              'Then list and pick a model:\n' +
              '  /workspace models <provider-id>\n' +
              '  /workspace model <provider/model>\n\n' +
              'Then log in to GitHub (optional):\n' +
              '  /git login <user> <token> <url>  — Set git credentials',
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
          await sendWorkspaceDetails(chatId, active, this.menuSvc);
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

  async handleWSCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
    switch (type) {
      case 'ws:show': {
        const ws = await this.workspaceService.findById(value, userId);
        if (!ws) {
          await this.notificationService.sendRaw(chatId, 'Workspace not found.');
          return;
        }
        await sendWorkspaceDetails(chatId, {
          id: ws.id,
          name: ws.name,
          workDir: ws.workDir,
          active: ws.active,
          providerId: ws.providerId,
          model: ws.model,
          projects: ws.projects,
        }, this.menuSvc);
        break;
      }
      case 'ws:set': {
        await this.workspaceService.setActive(value, userId);
        const ws = await this.workspaceService.findById(value, userId);
        await this.notificationService.sendRaw(chatId, `✅ Switched to "${ws?.name}"`);
        await showMainMenu(chatId, userId, this.menuSvc);
        break;
      }
      case 'ws:ghlogin': {
        await this.notificationService.sendRaw(
          chatId,
          'GitHub OAuth has been removed. Use:\n/git login <username> <token> <remote-url>\n\n' +
          'Example:\n/git login myuser ghp_abc123 https://github.com/org/repo.git',
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

  async showModelPicker(chatId: string, userId: string, workspaceId: string, providerId?: string): Promise<void> {
    try {
      const models = await this.workspaceService.listOpenCodeModels(workspaceId, userId, providerId);
      if (models.length === 0) {
        await this.notificationService.sendRaw(
          chatId,
          `No models found${providerId ? ` for ${providerId}` : ''}. Configure credentials first: /workspace provider <provider-id> <api-key>`,
        );
        return;
      }
      const buttons = models.slice(0, 24).map((m) => {
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

  async handleModelCallback(chatId: string, userId: string, type: string, value: string): Promise<string | null> {
    if (type === 'model:pick') {
      const entry = this.modelCallbackStore.get(value);
      if (!entry) {
        await this.notificationService.sendRaw(chatId, 'Model selection expired. Please pick again.');
        return null;
      }
      this.modelCallbackStore.delete(value);
      const { workspaceId, model } = entry;
      try {
        const ws = await this.workspaceService.setDefaultModel(workspaceId, userId, model);
        await this.notificationService.sendRaw(chatId, `✅ ${ws.name} now uses ${model} by default.`);

        await showMainMenu(chatId, userId, this.menuSvc);
        return workspaceId;
      } catch (err) {
        await this.notificationService.sendRaw(chatId, `Model selection error: ${(err as Error).message}`);
      }
      return null;
    }
    return null;
  }
}
