import { registerAs } from '@nestjs/config';
import { execSync } from 'node:child_process';
import { LogLevel, parseAuthorizedUsers } from './environment.validation';

function resolveBinary(name: string): string {
  if (name.includes('/')) return name;
  try {
    return execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
  } catch {
    return name;
  }
}

/**
 * Centralised application configuration object. Inject via `ConfigService` /
 * the typed `APP_CONFIG` token. All values come from validated environment.
 */
export interface AppConfig {
  botToken: string;
  opencodePath: string;
  redisUrl: string;
  githubToken: string;
  defaultRepository: string;
  port: number;
  webhookDomain: string;
  databaseUrl: string;
  logLevel: LogLevel;
  maxConcurrentTasks: number;
  taskTimeoutMs: number;
  authorizedUsers: Set<number>;
}

export const APP_CONFIG = 'APP_CONFIG';

export const appConfig = registerAs('app', (): AppConfig => {
  const authorizedUsersRaw = process.env['AUTHORIZED_USERS'] ?? '';
  return {
    botToken: process.env['BOT_TOKEN'] ?? '',
    opencodePath: resolveBinary(process.env['OPENCODE_PATH'] ?? 'opencode'),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    githubToken: process.env['GITHUB_TOKEN'] ?? '',
    defaultRepository: process.env['DEFAULT_REPOSITORY'] ?? 'default',
    port: Number(process.env['PORT'] ?? 3000),
    webhookDomain: process.env['WEBHOOK_DOMAIN'] ?? '',
    databaseUrl: process.env['DATABASE_URL'] ?? 'file:./dev.db',
    logLevel: (process.env['LOG_LEVEL'] as LogLevel) ?? LogLevel.INFO,
    maxConcurrentTasks: Number(process.env['MAX_CONCURRENT_TASKS'] ?? 3),
    taskTimeoutMs: Number(process.env['TASK_TIMEOUT_MS'] ?? 1800000),
    authorizedUsers: parseAuthorizedUsers(authorizedUsersRaw),
  };
});
