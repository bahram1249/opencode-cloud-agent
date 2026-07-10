import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { CreateTaskDto, RetryTaskDto, TaskQueryDto, UpdateTaskStatusDto } from './dto/create-task.dto';

/**
 * REST API for task management. Telegram commands and the workflow engine
 * interact through this controller (and the service directly via DI).
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created' })
  async create(@Body() dto: CreateTaskDto) {
    return this.taskService.createTask(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks with optional filters' })
  async list(@Query() query: TaskQueryDto) {
    return this.taskService.listTasks(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by id' })
  async findOne(@Param('id') id: string) {
    return this.taskService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition a task to a new workflow state' })
  @UsePipes()
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    await this.taskService.transition(id, dto.status as never, dto.reason ? { errorMessage: dto.reason } : {});
    return { id, status: dto.status };
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a task' })
  async retry(@Param('id') id: string, @Body() dto: RetryTaskDto) {
    return this.taskService.retryTask(id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a running task' })
  async cancel(@Param('id') id: string) {
    await this.taskService.cancelTask(id);
    return { id, cancelled: true };
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get task logs' })
  async logs(@Param('id') id: string) {
    return this.taskService.getLogs(id);
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'Get task executions' })
  async executions(@Param('id') id: string) {
    return this.taskService.getExecutions(id);
  }
}
