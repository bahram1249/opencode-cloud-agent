import type { Update, User, Chat } from 'telegraf/types';

/** Context attached to each Telegram update, used by guards and commands. */
export interface TelegramContext {
  from: User | undefined;
  chat: Chat | undefined;
  update: Update;
  updateId: number;
}


