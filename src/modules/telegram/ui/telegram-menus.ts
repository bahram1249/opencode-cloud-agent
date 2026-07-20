import { Markup } from 'telegraf';
import type { NotificationService } from 'src/modules/notification/notification.service';
import type { WorkspaceService } from 'src/modules/workspace/workspace.service';
import type { SessionService, ActiveSession } from 'src/modules/session/session.service';
import { cb } from '../utils/telegram-callback.utils';

export interface MenuServices {
  notificationService: NotificationService;
  workspaceService: WorkspaceService;
  sessionService: SessionService;
}

export async function showMainMenu(chatId: string, userId: string, svc: MenuServices): Promise<void> {
  const session = svc.sessionService.getUserSession(userId);
  const active = await svc.workspaceService.getActive(userId);
  const wsName = active ? `${active.name} (${active.workDir})` : 'None';

  let text = `📌 *Workspace:* ${wsName}\n`;
  if (session) {
    text += `⚡ *Session:* ${session.publicId} (active)\n\nSend text to interact, or use the buttons below.`;
  } else {
    text += `\nNo active session. Send a prompt to start one, or use the buttons below.`;
  }

  const buttons: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];
  if (session) {
    buttons.push([Markup.button.callback('✋ Cancel Session', cb('sess:cancel'))]);
  } else {
    buttons.push([Markup.button.callback('🚀 New Session', cb('sess:new'))]);
  }
  buttons.push(
    [Markup.button.callback('📊 Git', cb('nav:git')), Markup.button.callback('📁 Projects', cb('nav:projects'))],
    [Markup.button.callback('📋 Workspace', cb('nav:ws'))],
  );

  await svc.notificationService.sendRawWithKeyboard(chatId, text, Markup.inlineKeyboard(buttons));
}

export async function showGitMenu(chatId: string, userId: string, svc: MenuServices): Promise<void> {
  const active = await svc.workspaceService.getActive(userId);
  if (!active) {
    await svc.notificationService.sendRaw(chatId, 'No active workspace.');
    return;
  }

  const projects = await svc.workspaceService.getProjects(active.id);
  if (projects.length === 0) {
    await svc.notificationService.sendRaw(chatId, 'No git projects in this workspace. Add: /project add <name> <path> [remote-url]');
    return;
  }

  const buttons = projects.slice(0, 8).map((p) => [
    Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
  ]);
  buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `Select a project for Git operations (workspace: ${active.name}):`,
    Markup.inlineKeyboard(buttons),
  );
}

export async function showWorkspaceMenu(chatId: string, userId: string, svc: MenuServices): Promise<void> {
  const all = await svc.workspaceService.findAll(userId);
  const active = await svc.workspaceService.getActive(userId);

  const buttons = all.slice(0, 8).map((w) => [
    Markup.button.callback(
      `${w.active ? '✅ ' : ''}${w.name}`,
      cb('ws:show', w.id),
    ),
  ]);
  buttons.push([Markup.button.callback('➕ New Workspace', cb('ws:create'))]);
  buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

  const activeName = active ? active.name : 'None';
  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `📋 *Workspaces*\nActive: ${activeName}\n\nTap a workspace to see details and switch:`,
    Markup.inlineKeyboard(buttons),
  );
}

export async function showProjectList(chatId: string, userId: string, svc: MenuServices): Promise<void> {
  const active = await svc.workspaceService.getActive(userId);
  if (!active) {
    await svc.notificationService.sendRaw(chatId, 'No active workspace.');
    return;
  }

  const projects = await svc.workspaceService.getProjects(active.id);
  if (projects.length === 0) {
    await svc.notificationService.sendRaw(chatId, `No projects in "${active.name}".\nAdd: /project add <name> <path> [remote-url]\nExample: /project add frontend . https://github.com/org/repo.git`);
    return;
  }

  const lines = projects.slice(0, 10).map((p) => `• ${p.name} — ${'path' in p && p.path ? p.path : '.'}`);
  const buttons = projects.slice(0, 6).map((p) => [
    Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
    Markup.button.callback(`🗑️`, cb('proj:delete', p.id)),
  ]);
  buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `📁 *Projects in ${active.name}*\n${lines.join('\n')}`,
    Markup.inlineKeyboard(buttons),
  );
}

export async function showSessionContext(
  chatId: string,
  userId: string,
  session: ActiveSession,
  svc: MenuServices,
): Promise<void> {
  const active = await svc.workspaceService.getActive(userId);
  const projects = active ? await svc.workspaceService.getProjects(active.id) : [];

  const wsLine = active ? `Workspace: ${active.name} ${active.workDir}` : 'No workspace';

  const projButtons = projects.slice(0, 4).map((p) =>
    Markup.button.callback(`📁 ${p.name}`, cb('proj:select', p.id)),
  );

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✋ Cancel Session', cb('sess:cancel'))],
    [Markup.button.callback('📊 Git Status', cb('nav:git')), Markup.button.callback('📁 Projects', cb('nav:projects'))],
    [Markup.button.callback('📋 Workspace', cb('nav:ws'))],
    ...(projButtons.length > 0 ? [projButtons] : []),
  ]);

  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `🤖 *Session ${session.publicId} active*\n${wsLine}\nPrompt: ${session.prompt.slice(0, 100)}`,
    keyboard,
  );
}

export async function sendWorkspaceDetails(
  chatId: string,
  ws: {
    id: string;
    name: string;
    workDir: string;
    active: boolean;
    providerId?: string | null;
    model?: string | null;
    projects: Array<{ id: string; name: string; gitPath: string; branch: string; path?: string }>;
  },
  svc: MenuServices,
): Promise<void> {
  const projList = ws.projects.map((p) => `• ${p.name} — ${p.path ?? '.'}`).join('\n') || '  No projects';

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

  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `📋 *${ws.name}*${ws.active ? ' (active)' : ''}\nPath: ${ws.workDir}\nProvider: ${ws.providerId ?? 'not configured'}\nModel: ${ws.model ?? 'not selected'}\n\nProjects:\n${projList}`,
    Markup.inlineKeyboard(rows),
  );
}
