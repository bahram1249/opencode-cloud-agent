/** Log severity levels for TaskLog entries. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Result of running an external command via the OpenCode/Build service. */
export interface CommandResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly durationMs: number;
  readonly command: string;
}

/** Payload for a notification dispatched to the NotificationModule. */
export interface NotificationPayload {
  readonly taskId: string;
  readonly chatId: string;
  readonly level: 'info' | 'success' | 'warn' | 'error';
  readonly title: string;
  readonly body?: string;
  readonly buttons?: NotificationButton[];
}

export interface NotificationButton {
  readonly label: string;
  readonly action: string;
  readonly data: Record<string, string>;
}

/** Snapshot of a running OpenCode process for cancellation. */
export interface RunningProcess {
  readonly taskId: string;
  readonly pid: number;
  readonly stage: string;
  readonly startedAt: number;
  cancel: () => void;
}
