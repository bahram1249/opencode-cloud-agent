import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, WORKFLOW_JOB } from 'src/common/constants/queue.constants';
import { WorkflowOrchestrator } from 'src/modules/workflow/workflow-orchestrator.service';

/**
 * Processes workflow jobs from the BullMQ queue. Each job triggers a stage
 * of the task lifecycle via the WorkflowOrchestrator.
 */
@Processor(QUEUE_NAMES.WORKFLOW)
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(private readonly orchestrator: WorkflowOrchestrator) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job ${job.name} (${job.id})`);
    const { taskId, chatId } = job.data as { taskId: string; chatId?: string };

    switch (job.name) {
      case WORKFLOW_JOB.RUN_TASK:
        await this.orchestrator.runTask(taskId);
        break;
      case WORKFLOW_JOB.APPROVE:
        await this.orchestrator.approveTask(taskId, chatId ?? '0');
        break;
      case WORKFLOW_JOB.REJECT:
        await this.orchestrator.rejectTask(taskId, chatId ?? '0');
        break;
      case WORKFLOW_JOB.CANCEL:
        await this.orchestrator.cancelTask(taskId);
        break;
      case WORKFLOW_JOB.RESUME:
        await this.orchestrator.resumeTask(taskId);
        break;
      default:
        this.logger.warn(`Unknown workflow job: ${job.name}`);
    }
  }
}
