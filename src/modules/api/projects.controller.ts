import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { CurrentInitDataUser as InitDataUser } from 'src/common/decorators/init-data-user.decorator';
import { WorkspaceService } from '../workspace/workspace.service';
import { CreateProjectDto, UpdateProjectDto } from '../workspace/dto/workspace.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(TelegramInitDataGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('workspaces/:workspaceId/projects')
  @ApiOperation({ summary: 'List projects in a workspace' })
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.workspaceService.getProjects(workspaceId);
  }

  @Post('workspaces/:workspaceId/projects')
  @ApiOperation({ summary: 'Add a project to a workspace' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateProjectDto,
    @InitDataUser('id') userId: number,
  ) {
    return this.workspaceService.addProject(workspaceId, dto, String(userId));
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: 'Update project settings' })
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.workspaceService.updateProject(id, dto);
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: 'Remove a project from workspace' })
  async remove(@Param('id') id: string) {
    return this.workspaceService.removeProject(id);
  }

  @Post('projects/:id/install')
  @ApiOperation({ summary: 'Install project dependencies' })
  async install(@Param('id') id: string, @InitDataUser('id') userId: number) {
    return this.workspaceService.installProjectDependencies(id, String(userId));
  }
}
