import type { WorkflowState } from '../constants/workflow.constants';

/** Log severity levels for TaskLog entries. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Which stage an Execution belongs to. */
export type ExecutionStage =
  | 'opencode'
  | 'lint'
  | 'test'
  | 'build'
  | 'typecheck'
  | 'install'
  | 'git';

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

/** A requested transition in the workflow FSM. */
export interface WorkflowTransitionRequest {
  readonly taskId: string;
  readonly from: WorkflowState;
  readonly to: WorkflowState;
  readonly reason?: string;
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

/** Parsed Telegram command. */
export interface ParsedCommand {
  readonly name: string;
  readonly args: readonly string[];
  readonly raw: string;
}

/** Snapshot of a running OpenCode process for cancellation. */
export interface RunningProcess {
  readonly taskId: string;
  readonly pid: number;
  readonly stage: string;
  readonly startedAt: number;
  cancel: () => void;
}
