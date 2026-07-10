import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { WorkflowState } from 'src/common/constants/workflow.constants';
import { AppEvents } from 'src/common/constants/workflow.constants';
import type { LogLevel } from 'src/common/types';
import { CreateTaskDto, RetryTaskDto, TaskQueryDto } from './dto/create-task.dto';
import { RepositoryService } from 'src/modules/repository/repository.service';

/**
 * Central service for creating, reading, and managing task lifecycle.
 * State transitions are dispatched as events (consumed by WorkflowModule).
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly repositoryService: RepositoryService,
  ) {}

  /** Create a new task from a parsed prompt. */
  async createTask(dto: CreateTaskDto): Promise<{ id: string; publicId: string }> {
    const publicId = await this.generatePublicId();

    const data: Prisma.TaskCreateInput = {
      publicId,
      prompt: dto.prompt,
      status: WorkflowState.Pending,
      createdBy: String(dto.telegramUserId ?? 0),
      opencodeProfile: dto.opencodeProfile ?? null,
      attachments: JSON.stringify(dto.attachments ?? []),
      maxRetries: dto.maxRetries ?? 1,
    };

    if (dto.workspaceId) {
      data.workspace = { connect: { id: dto.workspaceId } };
    } else if (dto.repositorySlug) {
      const repo = await this.repositoryService.findBySlug(dto.repositorySlug);
      if (!repo) {
        throw new NotFoundException(`Repository "${dto.repositorySlug}" not found`);
      }
      data.repository = { connect: { id: repo.id } };
    } else {
      const defaultSlug = this.config.get<string>('app.defaultRepository', 'default');
      try {
        const repo = await this.repositoryService.findBySlug(defaultSlug);
        if (repo) data.repository = { connect: { id: repo.id } };
      } catch {
        // No default repository - task without repo is OK
      }
    }

    const task = await this.prisma.task.create({ data });

    this.logger.log(`Created task ${task.publicId}`);
    this.events.emit(AppEvents.TaskCreated, { taskId: task.id, publicId: task.publicId });
    return { id: task.id, publicId: task.publicId };
  }

  /** Find a task by its internal id. */
  async findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: {
        repository: true,
        workspace: { include: { projects: true } },
        logs: { take: 50, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /** Find a task by its public id (e.g. `t-8K3a`). */
  async findByPublicId(publicId: string) {
    return this.prisma.task.findUnique({
      where: { publicId },
      include: { repository: true, workspace: true },
    });
  }

  /** Paginated task list with optional filters. */
  async listTasks(query: TaskQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.repositorySlug) where.repository = { slug: query.repositorySlug };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { repository: { select: { slug: true, name: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** Transition a task to a new workflow state. Emits a state-changed event. */
  async transition(
    taskId: string,
    to: WorkflowState,
    extra: Partial<{
      errorMessage: string;
      commitSha: string;
      branch: string;
      tagName: string;
      startedAt: Date;
      finishedAt: Date;
    }> = {},
  ): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);

    const from = task.status as WorkflowState;
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: to, ...extra },
    });

    this.logger.log(`Task ${task.publicId}: ${from} -> ${to}`);
    this.events.emit(AppEvents.TaskStateChanged, {
      taskId,
      publicId: task.publicId,
      from,
      to,
    });
  }

  /** Append a log line to a task. */
  async addLog(taskId: string, level: LogLevel, message: string, meta?: unknown): Promise<void> {
    const log = await this.prisma.taskLog.create({
      data: {
        taskId,
        level,
        message,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
    this.events.emit(AppEvents.TaskLog, { taskId, logId: log.id, level, message });
  }

  /** Retry a failed/finished task by creating a child task with the same prompt. */
  async retryTask(taskId: string, dto: RetryTaskDto): Promise<{ id: string; publicId: string }> {
    const parent = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!parent) throw new NotFoundException(`Task ${taskId} not found`);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { retryCount: { increment: 1 } },
    });

    const publicId = await this.generatePublicId();
      const child = await this.prisma.task.create({
        data: {
          publicId,
          prompt: dto.prompt ?? parent.prompt,
          status: WorkflowState.Pending,
          createdBy: parent.createdBy,
        opencodeProfile: parent.opencodeProfile,
        attachments: parent.attachments,
        maxRetries: parent.maxRetries,
        parentId: parent.id,
        ...(parent.repositoryId ? { repository: { connect: { id: parent.repositoryId } } } : {}),
        ...(parent.workspaceId ? { workspace: { connect: { id: parent.workspaceId } } } : {}),
      },
    });

    this.events.emit(AppEvents.TaskCreated, { taskId: child.id, publicId: child.publicId });
    return { id: child.id, publicId: child.publicId };
  }

  /** Cancel a running task. */
  async cancelTask(taskId: string): Promise<void> {
    await this.transition(taskId, WorkflowState.Failed, {
      errorMessage: 'Cancelled by user',
      finishedAt: new Date(),
    });
  }

  /** Record an execution (command output) for a task. */
  async recordExecution(taskId: string, execution: {
    stage: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    cancelled: boolean;
    finishedAt: Date;
  }): Promise<void> {
    await this.prisma.execution.create({
      data: { taskId, ...execution },
    });
  }

  /** List all executions for a task. */
  async getExecutions(taskId: string) {
    return this.prisma.execution.findMany({
      where: { taskId },
      orderBy: { startedAt: 'asc' },
    });
  }

  /** List logs for a task. */
  async getLogs(taskId: string, limit = 100) {
    return this.prisma.taskLog.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Generate a short unique public id: `t-XXXX`. */
  private async generatePublicId(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let id = 't-';
      for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      const exists = await this.prisma.task.findUnique({ where: { publicId: id }, select: { id: true } });
      if (!exists) return id;
    }
    throw new Error('Failed to generate unique public id');
  }
}
