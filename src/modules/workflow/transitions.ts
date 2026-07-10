import { WorkflowState, WorkflowEvent } from 'src/common/constants/workflow.constants';

export const TRANSITIONS: Record<string, Partial<Record<WorkflowEvent, WorkflowState>>> = {
  [WorkflowState.Pending]: {
    [WorkflowEvent.Start]: WorkflowState.Running,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.Running]: {
    [WorkflowEvent.CodingStarted]: WorkflowState.Coding,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.Coding]: {
    [WorkflowEvent.CodingFinished]: WorkflowState.Testing,
    [WorkflowEvent.Finish]: WorkflowState.Finished,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.Testing]: {
    [WorkflowEvent.BuildFinished]: WorkflowState.WaitingApproval,
    [WorkflowEvent.TestsFailed]: WorkflowState.Failed,
    [WorkflowEvent.Finish]: WorkflowState.Finished,
    [WorkflowEvent.ApprovalRequested]: WorkflowState.WaitingApproval,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.WaitingApproval]: {
    [WorkflowEvent.Approved]: WorkflowState.Committing,
    [WorkflowEvent.Finish]: WorkflowState.Finished,
    [WorkflowEvent.Rejected]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Resume]: WorkflowState.Testing,
  },
  [WorkflowState.Committing]: {
    [WorkflowEvent.CommitFinished]: WorkflowState.Pushing,
    [WorkflowEvent.Finish]: WorkflowState.Finished,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
  },
  [WorkflowState.Pushing]: {
    [WorkflowEvent.PushFinished]: WorkflowState.Finished,
    [WorkflowEvent.Finish]: WorkflowState.Finished,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
  },
  [WorkflowState.Finished]: {
    [WorkflowEvent.Resume]: WorkflowState.Pending,
  },
  [WorkflowState.Failed]: {
    [WorkflowEvent.Resume]: WorkflowState.Pending,
    [WorkflowEvent.Start]: WorkflowState.Running,
  },
};

export function resolveTransition(
  current: WorkflowState,
  event: WorkflowEvent,
): WorkflowState | null {
  return TRANSITIONS[current]?.[event] ?? null;
}
