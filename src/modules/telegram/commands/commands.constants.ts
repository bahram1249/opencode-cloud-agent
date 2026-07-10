/**
 * All supported Telegram bot commands. Listed in /help and registered with
 * BotFather via setMyCommands.
 */
export const BOT_COMMANDS = [
  { command: 'new', description: 'Start a new task — /new <prompt>' },
  { command: 'repos', description: 'List registered repositories' },
  { command: 'status', description: 'Show status of a task — /status <taskId>' },
  { command: 'tasks', description: 'List recent tasks' },
  { command: 'cancel', description: 'Cancel a running task — /cancel <taskId>' },
  { command: 'resume', description: 'Resume a failed task — /resume <taskId>' },
  { command: 'logs', description: 'Get logs for a task — /logs <taskId>' },
  { command: 'diff', description: 'Get git diff for a task — /diff <taskId>' },
  { command: 'approve', description: 'Approve a waiting task — /approve <taskId>' },
  { command: 'reject', description: 'Reject a waiting task — /reject <taskId>' },
  { command: 'help', description: 'Show this help message' },
] as const;

export const CALLBACK_ACTIONS = {
  APPROVE: 'approve',
  REJECT: 'reject',
  CANCEL: 'cancel',
  LOGS: 'logs',
  DIFF: 'diff',
} as const;
