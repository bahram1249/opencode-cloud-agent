import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { TelegramContext } from '../telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { GitAuthService } from 'src/modules/git-auth/git-auth.service';
import { TelegramWorkspaceHandler } from './telegram-workspace.handler';
import { cb } from '../utils/telegram-callback.utils';

@Injectable()
export class TelegramSetupHandler {
  setupWizardState = new Map<string, {
    step: 'provider' | 'api-key' | 'models' | 'github' | 'github-token';
    workspaceId: string;
    providerId?: string;
  }>();

  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly gitAuthService: GitAuthService,
    private readonly workspaceHandler: TelegramWorkspaceHandler,
  ) {}

  isInWizard(userId: string): boolean {
    return this.setupWizardState.has(userId);
  }

  async handleSetupCmd(ctx: TelegramContext, _args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);

    let active = await this.workspaceService.getActive(userId);
    if (!active) {
      const all = await this.workspaceService.findAll(userId);
      if (all.length === 0) {
        await this.notificationService.sendRaw(chatId, 'No workspace yet. Create one first: /workspace create <name>\nThen run /setup to configure it.');
        return;
      }
      active = all[0];
      if (!active) return;
      await this.workspaceService.setActive(active.id, userId);
    }

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

  async handleSetupCallback(chatId: string, userId: string, type: string, value: string): Promise<void> {
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
        state.step = 'models';
        await this.notificationService.sendRaw(chatId, 'Configuring provider...');
        try {
          await this.workspaceService.configureProvider(
            state.workspaceId, userId, state.providerId ?? '', value,
          );
          await this.notificationService.sendRaw(chatId, `✅ Provider "${state.providerId}" configured.\n\nStep 3: Pick a model...`);
          await this.workspaceHandler.showModelPicker(chatId, userId, state.workspaceId, state.providerId);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `❌ Provider config failed: ${(err as Error).message}\nRun /setup to try again.`);
          this.setupWizardState.delete(userId);
        }
        break;
      }
      case 'setup:model': {
        state.step = 'github';
        await this.notificationService.sendRawWithKeyboard(
          chatId,
          '✅ Model selected!\n\n*Step 4/4: Git Login (optional)*\n\n' +
          'Connect git to manage repositories and create PRs.\n\n' +
          'Use /git login or tap "Enter Credentials":',
          Markup.inlineKeyboard([
            [Markup.button.callback('🔑 Enter Credentials', cb('setup:githuntoken', state.workspaceId))],
            [Markup.button.callback('⏭ Skip', cb('setup:done', ''))],
          ]),
        );
        break;
      }
      case 'setup:githuntoken': {
        state.step = 'github-token';
        await this.notificationService.sendRaw(
          chatId,
          '📋 *Git Login — Step 4/4*\n\n' +
          'Send your git credentials as:\n' +
          '  /git login <username> <token> <remote-url>\n\n' +
          'Examples:\n' +
          '  GitHub:   /git login myuser ghp_abc123 https://github.com/org/repo.git\n' +
          '  GitLab:   /git login myuser glpat-xyz789 https://gitlab.com/group/repo.git\n' +
          '  Bitbucket:/git login myuser app-password https://bitbucket.org/team/repo.git\n\n' +
          'Or run /cancel to skip this step.',
        );
        break;
      }
      case 'setup:githuntoken:done': {
        try {
          const parts = value.split(' ').filter(Boolean);
          const username = parts[0] || 'user';
          const token = parts[1] || value;
          const result = await this.gitAuthService.setWorkspaceCredentials(
            state.workspaceId, username, token,
          );
          await this.notificationService.sendRaw(chatId, `✅ Git credentials stored (${result.tokenMasked})`);
        } catch (err) {
          await this.notificationService.sendRaw(chatId, `❌ Error: ${(err as Error).message}. You can retry with /git login.`);
        }
        this.setupWizardState.delete(userId);
        await this.notificationService.sendRaw(chatId, '✅ *Setup complete!*\n\nTry:\n  /project add <name> <path> <remote-url>\n  Or just send a prompt to start a session.');
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

  async handleWizardTextInput(chatId: string, userId: string, text: string): Promise<void> {
    const state = this.setupWizardState.get(userId);
    if (!state) return;

    if (text.trim().toLowerCase() === '/cancel') {
      this.setupWizardState.delete(userId);
      await this.notificationService.sendRaw(chatId, 'Setup cancelled.');
      return;
    }

    if (state.step === 'api-key' && state.providerId) {
      await this.handleSetupCallback(chatId, userId, 'setup:apikey', text);
      return;
    }

    if (state.step === 'github-token' && state.workspaceId) {
      const cleaned = text.replace(/^\/git\s+login\s+/i, '');
      await this.handleSetupCallback(chatId, userId, 'setup:githuntoken:done', cleaned);
      return;
    }
  }

  advanceAfterModel(chatId: string, userId: string, workspaceId: string): void {
    const state = this.setupWizardState.get(userId);
    if (state && state.step === 'models') {
      void this.handleSetupCallback(chatId, userId, 'setup:model', workspaceId);
    }
  }
}
