import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowEngine } from 'src/modules/workflow/workflow-engine.service';
import { TaskService } from 'src/modules/task/task.service';
import { WorkflowState, WorkflowEvent } from 'src/common/constants/workflow.constants';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let taskService: { findById: jest.Mock; transition: jest.Mock };

  beforeEach(async () => {
    const mockTaskService = {
      findById: jest.fn().mockResolvedValue({
        id: 'task-1',
        publicId: 't-abcd',
        status: WorkflowState.Pending,
      }),
      transition: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        { provide: TaskService, useValue: mockTaskService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    engine = moduleRef.get(WorkflowEngine);
    taskService = moduleRef.get(TaskService);
  });

  it('should fire a valid transition', async () => {
    const next = await engine.fire('task-1', WorkflowEvent.Start);
    expect(next).toBe(WorkflowState.Running);
    expect(taskService.transition).toHaveBeenCalledWith('task-1', WorkflowState.Running);
  });

  it('should throw on invalid transition', async () => {
    taskService.findById.mockResolvedValue({
      id: 'task-1',
      publicId: 't-abcd',
      status: WorkflowState.Finished,
    });

    await expect(engine.fire('task-1', WorkflowEvent.CodingStarted)).rejects.toThrow(
      'Invalid transition',
    );
  });

  it('should return false from canFire for invalid transition', async () => {
    taskService.findById.mockResolvedValue({
      id: 'task-1',
      publicId: 't-abcd',
      status: WorkflowState.Pending,
    });
    const can = await engine.canFire('task-1', WorkflowEvent.Approved);
    expect(can).toBe(false);
  });

  it('should return the current state', async () => {
    const state = await engine.getState('task-1');
    expect(state).toBe(WorkflowState.Pending);
  });
});
