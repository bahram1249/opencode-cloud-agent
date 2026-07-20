import { Injectable } from '@nestjs/common';
import type { TelegramContext } from './telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { SessionService } from 'src/modules/session/session.service';
import { TelegramSessionHandler } from './handlers/telegram-session.handler';
import { TelegramWorkspaceHandler } from './handlers/telegram-workspace.handler';
import { TelegramProjectHandler } from './handlers/telegram-project.handler';
import { TelegramGitHandler } from './handlers/telegram-git.handler';
import { TelegramSetupHandler } from './handlers/telegram-setup.handler';
import { parseCb } from './utils/telegram-callback.utils';
import { showMainMenu, showGitMenu, showWorkspaceMenu, showProjectList, type MenuServices } from './ui/telegram-menus';
import { HELP_TEXT } from './ui/telegram-help';

@Injectable()
export class TelegramCommandHandler {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
    private readonly sessionService: SessionService,
    private readonly sessionHandler: TelegramSessionHandler,
    private readonly workspaceHandler: TelegramWorkspaceHandler,
    private readonly projectHandler: TelegramProjectHandler,
    private readonly gitHandler: TelegramGitHandler,
    private readonly setupHandler: TelegramSetupHandler,
  ) {}

  private get menuSvc(): MenuServices {
    return {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: this.sessionService,
    };
  }

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
        await this.workspaceHandler.handleWSCallback(chatId, userId, action.t, value);
        break;
      case 'proj':
        await this.projectHandler.handleProjCallback(chatId, userId, action.t, value);
        break;
      case 'git':
        await this.gitHandler.handleGitCallback(chatId, userId, action.t, value);
        break;
      case 'sess':
        await this.sessionHandler.handleSessCallback(chatId, userId, action.t, value);
        break;
      case 'key':
        await this.sessionHandler.handleKeyAction(chatId, userId, value);
        break;
      case 'model': {
        const selectedWsId = await this.workspaceHandler.handleModelCallback(chatId, userId, action.t, value);
        if (selectedWsId) {
          this.setupHandler.advanceAfterModel(chatId, userId, selectedWsId);
        }
        break;
      }
      case 'branch':
        await this.projectHandler.handleBranchCallback(chatId, userId, action.t, value);
        break;
      case 'setup':
        await this.setupHandler.handleSetupCallback(chatId, userId, action.t, value);
        break;
    }
  }

  async handleTextInput(chatId: string, userId: string, text: string): Promise<void> {
    if (this.setupHandler.isInWizard(userId)) {
      await this.setupHandler.handleWizardTextInput(chatId, userId, text);
      return;
    }

    const handled = await this.projectHandler.handlePendingBranchSwitch(chatId, userId, text);
    if (handled) return;

    await this.sessionHandler.handleTextInput(chatId, userId, text, false);
  }

  async handleStartSessionCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    await this.sessionHandler.handleStartSessionCmd(ctx, args);
  }

  async handleSendCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    await this.sessionHandler.handleSendCmd(ctx, args);
  }

  async handleCancelCmd(ctx: TelegramContext, _args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    await this.sessionHandler.handleCancelCmd(chatId, userId);
  }

  async handleWorkspaceCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    await this.workspaceHandler.handleWorkspaceCmd(chatId, userId, args);
  }

  async handleProjectCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    await this.projectHandler.handleProjectCmd(ctx, args);
  }

  async handleGitCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    await this.gitHandler.handleGitCmd(chatId, userId, args);
  }

  async handleSessionsCmd(ctx: TelegramContext): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    await this.sessionHandler.handleSessionsCmd(chatId, userId);
  }

  async handleSetupCmd(ctx: TelegramContext, args: string[]): Promise<void> {
    await this.setupHandler.handleSetupCmd(ctx, args);
  }

  async handleKeyCmd(ctx: TelegramContext, key: string): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    const userId = String(ctx.from?.id ?? 0);
    await this.sessionHandler.handleKeyCmd(chatId, userId, key);
  }

  async handleHelp(ctx: TelegramContext): Promise<void> {
    const chatId = String(ctx.chat?.id ?? 0);
    await this.notificationService.sendRaw(chatId, HELP_TEXT);
  }

  private async handleNav(chatId: string, userId: string, target: string): Promise<void> {
    switch (target) {
      case 'main':
        await showMainMenu(chatId, userId, this.menuSvc);
        break;
      case 'git':
        await showGitMenu(chatId, userId, this.menuSvc);
        break;
      case 'ws':
        await showWorkspaceMenu(chatId, userId, this.menuSvc);
        break;
      case 'projects':
        await showProjectList(chatId, userId, this.menuSvc);
        break;
    }
  }
}
