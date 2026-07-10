export const BOT_COMMANDS = [
  { command: 'session', description: 'Start interactive session — /session <prompt>' },
  { command: 'send', description: 'Send text to active session — /send <text>' },
  { command: 'sessions', description: 'List / switch sessions — /sessions' },
  { command: 'cancel', description: 'Cancel active session — /cancel' },
  { command: 'tab', description: 'Send Tab key (completion) — /tab' },
  { command: 'enter', description: 'Send Enter (confirm) — /enter' },
  { command: 'up', description: 'Arrow Up — /up' },
  { command: 'down', description: 'Arrow Down — /down' },
  { command: 'ctrl_c', description: 'Interrupt (Ctrl+C) — /ctrl_c' },
  { command: 'workspace', description: 'Manage workspaces — /workspace <action>' },
  { command: 'project', description: 'Manage git projects — /project <action>' },
  { command: 'git', description: 'Git operations — /git <subcommand>' },
  { command: 'opencode', description: 'Send raw OpenCode command — /opencode <args>' },
  { command: 'model', description: 'Switch model — /model <name>' },
  { command: 'skill', description: 'Load skill — /skill <name>' },
  { command: 'help', description: 'Show help' },
] as const;

export const CALLBACK_ACTIONS = {
  APPROVE: 'approve',
  REJECT: 'reject',
  CANCEL: 'cancel',
  LOGS: 'logs',
  DIFF: 'diff',
} as const;
