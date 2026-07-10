import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, CreateProjectDto, UpdateProjectDto } from './dto/workspace.dto';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  async create(@Body() dto: CreateWorkspaceDto) {
    return this.workspaceService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all workspaces' })
  async findAll() {
    return this.workspaceService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the active workspace' })
  async getActive() {
    return this.workspaceService.getActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workspace by id' })
  async findOne(@Param('id') id: string) {
    return this.workspaceService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workspace' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaceService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a workspace' })
  async remove(@Param('id') id: string) {
    return this.workspaceService.remove(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Set as active workspace' })
  async activate(@Param('id') id: string) {
    return this.workspaceService.setActive(id);
  }

  @Post(':id/projects')
  @ApiOperation({ summary: 'Add a git project to the workspace' })
  async addProject(@Param('id') id: string, @Body() dto: CreateProjectDto) {
    return this.workspaceService.addProject(id, dto);
  }

  @Get(':id/projects')
  @ApiOperation({ summary: 'List projects in a workspace' })
  async getProjects(@Param('id') id: string) {
    return this.workspaceService.getProjects(id);
  }

  @Patch('projects/:projectId')
  @ApiOperation({ summary: 'Update a project' })
  async updateProject(@Param('projectId') projectId: string, @Body() dto: UpdateProjectDto) {
    return this.workspaceService.updateProject(projectId, dto);
  }

  @Delete('projects/:projectId')
  @ApiOperation({ summary: 'Remove a project' })
  async removeProject(@Param('projectId') projectId: string) {
    return this.workspaceService.removeProject(projectId);
  }
}
