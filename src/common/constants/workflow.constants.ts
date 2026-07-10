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

export enum WorkflowEvent {
  Start = 'workflow.start',
  CodingStarted = 'workflow.coding.started',
  CodingFinished = 'workflow.coding.finished',
  BuildFinished = 'workflow.build.finished',
  TestsFailed = 'workflow.tests.failed',
  ApprovalRequested = 'workflow.approval.requested',
  Approved = 'workflow.approved',
  Rejected = 'workflow.rejected',
  CommitFinished = 'workflow.commit.finished',
  PushFinished = 'workflow.push.finished',
  Cancel = 'workflow.cancel',
  Resume = 'workflow.resume',
  Fail = 'workflow.fail',
  Finish = 'workflow.finish',
}

export const AppEvents = {
  TaskCreated: 'task.created',
  TaskStateChanged: 'task.state.changed',
  TaskLog: 'task.log',
  TaskFailed: 'task.failed',
  TaskFinished: 'task.finished',
  ExecutionOutput: 'execution.output',
  SessionFinished: 'session.finished',
} as const;
