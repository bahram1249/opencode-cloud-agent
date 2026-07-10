import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';
import { Logger } from '@nestjs/common';

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Strongly-typed environment configuration. Validated at boot via
 * `validateEnvironment`. No `any` — every variable is declared and typed.
 */
export class EnvironmentVariables {
  @IsString()
  BOT_TOKEN!: string;

  @IsString()
  AUTHORIZED_USERS!: string;

  @IsString()
  OPENCODE_PATH!: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  GITHUB_TOKEN?: string;

  @IsString()
  DEFAULT_REPOSITORY!: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  WEBHOOK_DOMAIN?: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsEnum(LogLevel)
  @IsOptional()
  LOG_LEVEL?: LogLevel;

  @IsNumber()
  @Min(0)
  @IsOptional()
  MAX_CONCURRENT_TASKS?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  TASK_TIMEOUT_MS?: number;
}

/**
 * Validate the current `process.env` against the schema above.
 * Throws on missing/invalid configuration so the app fails fast.
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const transformed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(transformed, { skipMissingProperties: false });
  if (errors.length > 0) {
    Logger.error(
      errors
        .map(
          (e) =>
            `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join('\n'),
      'EnvironmentValidation',
    );
    throw new Error('Invalid environment configuration. See errors above.');
  }
  return transformed;
}

/** Parsed helper: turn the comma-separated AUTHORIZED_USERS into a Set<number>. */
export function parseAuthorizedUsers(raw: string): Set<number> {
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
  );
}
