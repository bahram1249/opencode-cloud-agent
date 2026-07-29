import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from 'src/config/app.config';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { WorkspaceService } from '../workspace/workspace.service';
import { SessionService } from '../session/session.service';
import { validateAuthToken } from 'src/common/utils/auth-token';

@ApiExcludeController()
@Controller('mini-app')
export class MiniAppController {
  private readonly logger = new Logger(MiniAppController.name);
  private readonly htmlTemplate: string;
  private readonly miniAppUrl: string;

  private readonly botToken: string;

  constructor(
    private readonly initDataGuard: TelegramInitDataGuard,
    private readonly workspaceService: WorkspaceService,
    private readonly sessionService: SessionService,
    config: ConfigService,
  ) {
    this.htmlTemplate = readFileSync(
      resolve(process.cwd(), 'mini-app-assets', 'index.html'),
      'utf-8',
    );
    const appConfig = config.get<AppConfig>('app');
    this.miniAppUrl = appConfig?.miniAppUrl ?? '';
    this.botToken = appConfig?.botToken ?? '';
  }

  @Get()
  async serve(
    @Query('tgWebAppData') tgWebAppData: string | undefined,
    @Query('initData') initData: string | undefined,
    @Query('token') token: string | undefined,
    @Query('session') session: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    let rawData = tgWebAppData || initData;
    let user: { id: number; firstName: string; lastName?: string; username?: string };

    if (rawData) {
      try {
        user = this.initDataGuard.validateInitData(rawData);
      } catch {
        res.status(401).type('text/html').send('<h1>Unauthorized</h1><p>Invalid initData signature</p>');
        return;
      }
    } else if (token && this.botToken) {
      const validatedUserId = validateAuthToken(this.botToken, token);
      if (!validatedUserId) {
        res.status(401).type('text/html').send('<h1>Unauthorized</h1><p>Invalid or expired token</p>');
        return;
      }
      user = { id: Number(validatedUserId), firstName: 'User', lastName: '', username: '' };
      rawData = token;
    } else {
      res.status(401).type('text/html').send('<h1>Unauthorized</h1><p>Missing authentication (token, initData, or tgWebAppData required)</p>');
      return;
    }

    const userId = String(user.id);

    await this.workspaceService.ensureTenant(userId, user.firstName);

    const workspaces = await this.workspaceService.findAll(userId);
    const activeSession = this.sessionService.getUserSession(userId);
    const activeSessionData = activeSession
      ? { publicId: activeSession.publicId, id: activeSession.id, workspaceId: activeSession.workspaceId, prompt: activeSession.prompt.slice(0, 100), running: activeSession.running }
      : null;

    const state = {
      userId,
      userName: user.firstName,
      userUsername: user.username || null,
      devMode: false,
      miniAppUrl: this.miniAppUrl,
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        workDir: w.workDir,
        active: w.active,
        providerId: w.providerId || null,
        model: w.model || null,
        projectCount: w.projects?.length || 0,
        sessionCount: (w as { _count?: { sessions: number } })._count?.sessions ?? 0,
        hasGitToken: !!w.gitToken,
        gitUsername: w.gitUsername || null,
      })),
      activeSession: activeSessionData,
      initData: rawData,
      session: session ?? null,
    };

    const html = this.htmlTemplate.replace(
      '</head>',
      `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script></head>`,
    );

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.type('text/html').send(html);
  }
}
