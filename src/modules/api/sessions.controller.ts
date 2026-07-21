import { Controller, Get, Post, Param, Body, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { CurrentInitDataUser as InitDataUser } from 'src/common/decorators/init-data-user.decorator';
import { SessionService } from '../session/session.service';
import { CreateSessionDto, SessionQueryDto } from '../session/dto/session.dto';

@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(TelegramInitDataGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'List sessions for the authenticated user' })
  findAll(@InitDataUser('id') userId: number, @Query() _query: SessionQueryDto) {
    const sessions = this.sessionService.getUserSessions(String(userId));
    return sessions.map((s) => ({
      id: s.id,
      publicId: s.publicId,
      workspaceId: s.workspaceId,
      workspaceName: s.workspaceName,
      prompt: s.prompt,
      running: s.running,
      startedAt: s.startedAt,
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new session' })
  async create(@Body() dto: CreateSessionDto, @InitDataUser('id') userId: number) {
    const session = await this.sessionService.createSession(dto, String(userId), 'mini-app');
    return {
      id: session.id,
      publicId: session.publicId,
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
      prompt: session.prompt,
      running: session.running,
      startedAt: session.startedAt,
    };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a running session' })
  cancel(@Param('id') id: string, @InitDataUser('id') userId: number) {
    const session = this.sessionService.getActiveSession(id);
    if (!session || session.createdBy !== String(userId)) {
      throw new NotFoundException('Session not found');
    }
    const ok = this.sessionService.cancelSession(id);
    return { cancelled: ok };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details and output' })
  findOne(@Param('id') id: string, @InitDataUser('id') userId: number) {
    const session = this.sessionService.getActiveSession(id);
    if (!session || session.createdBy !== String(userId)) {
      throw new NotFoundException('Session not found');
    }
    return {
      id: session.id,
      publicId: session.publicId,
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
      prompt: session.prompt,
      running: session.running,
      output: session.outputBuffer,
      startedAt: session.startedAt,
    };
  }
}
