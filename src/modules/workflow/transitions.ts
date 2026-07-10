import { WorkflowState, WorkflowEvent } from 'src/common/constants/workflow.constants';

/**
 * Transition table for the workflow FSM. Each entry maps
 * (currentState, event) -> nextState. Events not in the table are rejected.
 */
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
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.Testing]: {
    [WorkflowEvent.BuildFinished]: WorkflowState.WaitingApproval,
    [WorkflowEvent.TestsFailed]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
  },
  [WorkflowState.WaitingApproval]: {
    [WorkflowEvent.Approved]: WorkflowState.Committing,
    [WorkflowEvent.Rejected]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
    [WorkflowEvent.Resume]: WorkflowState.Testing,
  },
  [WorkflowState.Committing]: {
    [WorkflowEvent.CommitFinished]: WorkflowState.Pushing,
    [WorkflowEvent.Fail]: WorkflowState.Failed,
    [WorkflowEvent.Cancel]: WorkflowState.Failed,
  },
  [WorkflowState.Pushing]: {
    [WorkflowEvent.PushFinished]: WorkflowState.Finished,
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

/**
 * Resolve the next state for a given (current, event) pair.
 * Returns null if the transition is not allowed.
 */
export function resolveTransition(
  current: WorkflowState,
  event: WorkflowEvent,
): WorkflowState | null {
  return TRANSITIONS[current]?.[event] ?? null;
}
