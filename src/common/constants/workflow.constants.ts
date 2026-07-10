/**
 * Finite state machine states for a task lifecycle.
 * @see WorkflowEngine
 */
export enum WorkflowState {
  Pending = 'pending',
  Running = 'running',
  Coding = 'coding',
  Testing = 'testing',
  WaitingApproval = 'waiting_approval',
  Committing = 'committing',
  Pushing = 'pushing',
  Finished = 'finished',
  Failed = 'failed',
}

export const WORKFLOW_STATES = Object.values(WorkflowState) as string[];

export const TERMINAL_STATES: WorkflowState[] = [WorkflowState.Finished, WorkflowState.Failed];

export const ACTIVE_STATES: WorkflowState[] = [
  WorkflowState.Running,
  WorkflowState.Coding,
  WorkflowState.Testing,
  WorkflowState.Committing,
  WorkflowState.Pushing,
  WorkflowState.WaitingApproval,
];

export enum WorkflowEvent {
  Start = 'workflow.start',
  CodingStarted = 'workflow.coding.started',
  CodingFinished = 'workflow.coding.finished',
  BuildStarted = 'workflow.build.started',
  BuildFinished = 'workflow.build.finished',
  TestsFailed = 'workflow.tests.failed',
  ApprovalRequested = 'workflow.approval.requested',
  Approved = 'workflow.approved',
  Rejected = 'workflow.rejected',
  CommitStarted = 'workflow.commit.started',
  CommitFinished = 'workflow.commit.finished',
  PushStarted = 'workflow.push.started',
  PushFinished = 'workflow.push.finished',
  Cancel = 'workflow.cancel',
  Resume = 'workflow.resume',
  Fail = 'workflow.fail',
  Finish = 'workflow.finish',
  StateChanged = 'workflow.state.changed',
}

/** Application-wide event names (EventEmitter2). */
export const AppEvents = {
  TaskCreated: 'task.created',
  TaskStateChanged: 'task.state.changed',
  TaskLog: 'task.log',
  TaskFailed: 'task.failed',
  TaskFinished: 'task.finished',
  ApprovalRequired: 'task.approval.required',
  ExecutionOutput: 'execution.output',
} as const;

export type AppEventName = (typeof AppEvents)[keyof typeof AppEvents];
