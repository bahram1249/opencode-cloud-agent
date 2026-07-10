import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from 'src/common/constants/queue.constants';
import { NotificationService } from 'src/modules/notification/notification.service';
import type { NotificationPayload } from 'src/common/types';

/**
 * Processes notification jobs from the BullMQ queue. Each job contains a
 * NotificationPayload that is sent to Telegram asynchronously.
 */
@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Sending notification (${job.id})`);
    const payload = job.data as NotificationPayload;
    await this.notificationService.send(payload);
  }
}
