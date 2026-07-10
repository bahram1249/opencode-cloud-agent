import { resolveTransition } from 'src/modules/workflow/transitions';
import { WorkflowState, WorkflowEvent } from 'src/common/constants/workflow.constants';

describe('Workflow Transitions', () => {
  it('should transition Pending + Start -> Running', () => {
    expect(resolveTransition(WorkflowState.Pending, WorkflowEvent.Start)).toBe(WorkflowState.Running);
  });

  it('should transition Coding + CodingFinished -> Testing', () => {
    expect(resolveTransition(WorkflowState.Coding, WorkflowEvent.CodingFinished)).toBe(WorkflowState.Testing);
  });

  it('should transition Testing + BuildFinished -> WaitingApproval', () => {
    expect(resolveTransition(WorkflowState.Testing, WorkflowEvent.BuildFinished)).toBe(WorkflowState.WaitingApproval);
  });

  it('should transition Testing + TestsFailed -> Failed', () => {
    expect(resolveTransition(WorkflowState.Testing, WorkflowEvent.TestsFailed)).toBe(WorkflowState.Failed);
  });

  it('should transition WaitingApproval + Approved -> Committing', () => {
    expect(resolveTransition(WorkflowState.WaitingApproval, WorkflowEvent.Approved)).toBe(WorkflowState.Committing);
  });

  it('should transition WaitingApproval + Rejected -> Failed', () => {
    expect(resolveTransition(WorkflowState.WaitingApproval, WorkflowEvent.Rejected)).toBe(WorkflowState.Failed);
  });

  it('should transition Committing + CommitFinished -> Pushing', () => {
    expect(resolveTransition(WorkflowState.Committing, WorkflowEvent.CommitFinished)).toBe(WorkflowState.Pushing);
  });

  it('should transition Pushing + PushFinished -> Finished', () => {
    expect(resolveTransition(WorkflowState.Pushing, WorkflowEvent.PushFinished)).toBe(WorkflowState.Finished);
  });

  it('should transition Failed + Resume -> Pending', () => {
    expect(resolveTransition(WorkflowState.Failed, WorkflowEvent.Resume)).toBe(WorkflowState.Pending);
  });

  it('should return null for invalid transitions', () => {
    expect(resolveTransition(WorkflowState.Pending, WorkflowEvent.Approved)).toBeNull();
    expect(resolveTransition(WorkflowState.Finished, WorkflowEvent.Start)).toBeNull();
  });

  it('should allow cancel from active states', () => {
    expect(resolveTransition(WorkflowState.Running, WorkflowEvent.Cancel)).toBe(WorkflowState.Failed);
    expect(resolveTransition(WorkflowState.Coding, WorkflowEvent.Cancel)).toBe(WorkflowState.Failed);
    expect(resolveTransition(WorkflowState.Testing, WorkflowEvent.Cancel)).toBe(WorkflowState.Failed);
    expect(resolveTransition(WorkflowState.Committing, WorkflowEvent.Cancel)).toBe(WorkflowState.Failed);
  });
});
