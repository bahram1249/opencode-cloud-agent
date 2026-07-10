/** BullMQ queue names used across the orchestrator. */
export const QUEUE_NAMES = {
  /** Drives the full workflow for a single task. */
  WORKFLOW: 'workflow',
  /** Notifies Telegram about progress. */
  NOTIFICATION: 'notification',
  /** Runs a single OpenCode/Build/Git command. */
  EXECUTION: 'execution',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job names within the workflow queue. */
export const WORKFLOW_JOB = {
  RUN_TASK: 'run-task',
  APPROVE: 'approve',
  REJECT: 'reject',
  CANCEL: 'cancel',
  RESUME: 'resume',
} as const;

/** Default job options shared by all queues. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
} as const;
