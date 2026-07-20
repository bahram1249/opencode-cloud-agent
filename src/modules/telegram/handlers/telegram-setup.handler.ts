import { Injectable } from '@nestjs/common';
import type { TelegramContext } from '../telegram.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { WorkspaceService } from 'src/modules/workspace/workspace.service';
import { showWorkspaceSettings } from '../ui/telegram-menus';

@Injectable()
export class TelegramSetupHandler {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly workspaceService: WorkspaceService,
  ) {}

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
      active = await this.workspaceService.getActive(userId);
      if (!active) return;
    }

    const ws = await this.workspaceService.findById(active.id, userId);
    if (!ws) return;

    const menuSvc = {
      notificationService: this.notificationService,
      workspaceService: this.workspaceService,
      sessionService: null as never,
    };

    await showWorkspaceSettings(chatId, 0, {
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
    }, menuSvc);
  }
}
