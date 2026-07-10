import type { Update, User, Chat } from 'telegraf/types';

/** Context attached to each Telegram update, used by guards and commands. */
export interface TelegramContext {
  from: User | undefined;
  chat: Chat | undefined;
  update: Update;
  updateId: number;
}

/** Command handler signature. */
export type CommandHandler = (ctx: TelegramContext, args: string[]) => Promise<void>;

/** Command metadata for registration. */
export interface CommandDefinition {
  name: string;
  description: string;
  handler: CommandHandler;
}

/** Callback query action type (for inline keyboard buttons). */
export interface CallbackAction {
  action: string;
  data: Record<string, string>;
}
