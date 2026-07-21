import { Markup } from 'telegraf';
import type { NotificationService } from 'src/modules/notification/notification.service';
import type { WorkspaceService } from 'src/modules/workspace/workspace.service';
import type { SessionService, ActiveSession } from 'src/modules/session/session.service';
import { cb } from '../utils/telegram-callback.utils';
import { generateAuthToken } from 'src/common/utils/auth-token';

const PROVIDER_ICONS: Record<string, string> = {
  opencode: '🔵',
  openai: '🟢',
  anthropic: '🟣',
  'github-copilot': '⚫',
};

function providerIcon(providerId?: string | null): string {
  return providerId ? (PROVIDER_ICONS[providerId] ?? '🔵') : '⚪';
}

function gitBadge(gitToken?: string | null): string {
  return gitToken ? '🔑✓' : '🔑✗';
}

export interface MenuServices {
  notificationService: NotificationService;
  workspaceService: WorkspaceService;
  sessionService: SessionService;
  refWs?: (wsId: string) => string;
  miniAppUrl?: string;
  botToken?: string;
}

export async function showMainMenu(chatId: string, userId: string, svc: MenuServices): Promise<void> {
  const session = svc.sessionService.getUserSession(userId);
  const active = await svc.workspaceService.getActive(userId);

  const wsLine = active
    ? `📌 *Workspace:* ${active.name} ${providerIcon(active.providerId)}${active.providerId ?? ''}`
    : '📌 *Workspace:* None';

  let text = `${wsLine}\n`;
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

  const buttons = all.slice(0, 8).map((w) => {
    const icon = providerIcon(w.providerId);
    const modelLabel = w.model ? `🤖${w.model.split('/').pop()}` : '—';
    const projCount = w.projects.length;
    const gitIcon = gitBadge(w.gitToken);
    const ref = svc.refWs ? svc.refWs(w.id) : w.id;
    const label = `${w.active ? '✅ ' : '   '}${w.name} ${icon} ${modelLabel} 📁${projCount} ${gitIcon}`;
    return [Markup.button.callback(label, cb('ws:show', ref))];
  });
  buttons.push([Markup.button.callback('➕ New Workspace', cb('ws:create'))]);
  buttons.push([Markup.button.callback('🔙 Main Menu', cb('nav:main'))]);

  const activeName = active ? active.name : 'None';
  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `📋 *Workspaces*\nActive: ${activeName}\n\nTap a workspace to manage it:`,
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

  const rows: Array<Array<ReturnType<typeof Markup.button.callback | typeof Markup.button.webApp>>> = [
    [Markup.button.callback('✋ Cancel Session', cb('sess:cancel'))],
    [Markup.button.callback('📊 Git Status', cb('nav:git')), Markup.button.callback('📁 Projects', cb('nav:projects'))],
    [Markup.button.callback('📋 Workspace', cb('nav:ws'))],
    ...(projButtons.length > 0 ? [projButtons.map((b) => b as ReturnType<typeof Markup.button.callback | typeof Markup.button.webApp>)] : []),
  ];

  if (svc.miniAppUrl) {
    const token = svc.botToken ? generateAuthToken(svc.botToken, userId) : '';
    const miniAppUrl = token
      ? `${svc.miniAppUrl}?session=${session.publicId}&token=${token}`
      : `${svc.miniAppUrl}?session=${session.publicId}`;
    rows.push([Markup.button.webApp('🚀 Open in Mini App', miniAppUrl)]);
  }

  const keyboard = Markup.inlineKeyboard(rows as never);

  await svc.notificationService.sendRawWithKeyboard(
    chatId,
    `🤖 *Session ${session.publicId} active*\n${wsLine}\nPrompt: ${session.prompt.slice(0, 100)}`,
    keyboard,
  );
}

interface WorkspaceSettingsData {
  id: string;
  name: string;
  workDir: string;
  active: boolean;
  providerId?: string | null;
  model?: string | null;
  projects: Array<{ id: string; name: string; gitPath: string; branch: string; path?: string }>;
  gitToken?: string | null;
  gitUsername?: string | null;
  sessionCount: number;
}

export async function showWorkspaceSettings(
  chatId: string,
  messageId: number,
  ws: WorkspaceSettingsData,
  svc: MenuServices,
): Promise<void> {
  const icon = providerIcon(ws.providerId);
  const providerLine = ws.providerId
    ? `${icon} *Provider:* ${ws.providerId}`
    : `⚪ *Provider:* not configured`;

  const modelLine = ws.model
    ? `🤖 *Model:* ${ws.model}`
    : `🤖 *Model:* not selected`;

  const projCount = ws.projects.length;
  const projectsLine = `📁 *Projects:* ${projCount}`;

  const gitLine = ws.gitToken
    ? `🔑 *Git:* ✅ ${ws.gitUsername ?? 'logged in'}`
    : `🔑 *Git:* not configured`;

  const sessionLine = `⚡ *Sessions:* ${ws.sessionCount}`;

  const text = [
    `⚙️ *Settings — ${ws.name}*${ws.active ? ' (active)' : ''}`,
    ``,
    providerLine,
    modelLine,
    projectsLine,
    gitLine,
    sessionLine,
  ].join('\n');

  const refId = svc.refWs ? svc.refWs(ws.id) : ws.id;

  const rows: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

  rows.push([
    Markup.button.callback('🔵 Change Provider', cb('ws:setting:provider', refId)),
    Markup.button.callback('🤖 Change Model', cb('ws:models', refId)),
  ]);
  rows.push([
    Markup.button.callback('📁 Manage Projects', cb('ws:setting:projects', refId)),
    Markup.button.callback('🔑 Manage Git', cb('ws:setting:git', refId)),
  ]);
  rows.push([
    Markup.button.callback('⚡ Sessions', cb('ws:setting:sessions', refId)),
  ]);

  if (!ws.active) {
    rows.push([Markup.button.callback('✅ Set Active', cb('ws:set', refId))]);
  }

  rows.push([
    Markup.button.callback('✏️ Rename', cb('ws:rename', refId)),
    Markup.button.callback('🗑️ Delete', cb('ws:delete', refId)),
  ]);
  rows.push([
    Markup.button.callback('❓ Help', cb('help:settings')),
    Markup.button.callback('🔙 Workspaces', cb('nav:ws')),
  ]);

  if (messageId > 0) {
    await svc.notificationService.editMessage(chatId, messageId, text, Markup.inlineKeyboard(rows));
  } else {
    await svc.notificationService.sendRawWithKeyboard(chatId, text, Markup.inlineKeyboard(rows));
  }
}
