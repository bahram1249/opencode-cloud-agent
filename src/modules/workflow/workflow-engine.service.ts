import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowState, WorkflowEvent, AppEvents } from 'src/common/constants/workflow.constants';
import { resolveTransition } from './transitions';
import { TaskService } from '../task/task.service';

/**
 * Finite state machine engine. Validates and applies state transitions
 * for tasks. Each transition is: look up the (current, event) pair in the
 * transition table, reject if not allowed, persist the new state via
 * TaskService, and emit a state-changed event.
 *
 * The engine itself is stateless — all state lives in the database.
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Attempt to transition a task to a new state via an event.
   * @returns the new state, or throws if the transition is not allowed.
   */
  async fire(taskId: string, event: WorkflowEvent): Promise<WorkflowState> {
    const task = await this.taskService.findById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const current = task.status as WorkflowState;
    const next = resolveTransition(current, event);

    if (!next) {
      throw new Error(`Invalid transition: ${current} + ${event} (task ${task.publicId})`);
    }

    this.logger.log(`FSM: ${current} -> ${next} (event: ${event}, task: ${task.publicId})`);
    await this.taskService.transition(taskId, next);

    this.events.emit(AppEvents.TaskStateChanged, {
      taskId,
      publicId: task.publicId,
      from: current,
      to: next,
      event,
    });

    return next;
  }

  /** Check if a transition is valid without applying it. */
  async canFire(taskId: string, event: WorkflowEvent): Promise<boolean> {
    const task = await this.taskService.findById(taskId);
    if (!task) return false;
    return resolveTransition(task.status as WorkflowState, event) !== null;
  }

  /** Get the current state of a task. */
  async getState(taskId: string): Promise<WorkflowState | null> {
    const task = await this.taskService.findById(taskId);
    return task ? (task.status as WorkflowState) : null;
  }
}
