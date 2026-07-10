import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from 'src/common/constants/queue.constants';
import { WorkflowProcessor } from './workflow.processor';
import { NotificationProcessor } from './notification.processor';
import { TaskModule } from 'src/modules/task/task.module';
import { WorkflowModule } from 'src/modules/workflow/workflow.module';
import { NotificationModule } from 'src/modules/notification/notification.module';

/**
 * Registers all BullMQ queues and their processors. The queues are:
 *   - workflow: drives the full task lifecycle
 *   - notification: sends Telegram messages asynchronously
 *   - execution: runs individual commands (offloaded from the workflow)
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.WORKFLOW, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: QUEUE_NAMES.NOTIFICATION, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: QUEUE_NAMES.EXECUTION, defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
    TaskModule,
    WorkflowModule,
    NotificationModule,
  ],
  providers: [WorkflowProcessor, NotificationProcessor],
  exports: [BullModule],
})
export class QueueModule {}
