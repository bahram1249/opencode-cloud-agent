import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { CurrentInitDataUser as InitDataUser } from 'src/common/decorators/init-data-user.decorator';
import { WorkspaceService } from '../workspace/workspace.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from '../workspace/dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(TelegramInitDataGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces for the authenticated user' })
  async findAll(@InitDataUser('id') userId: number) {
    return this.workspaceService.findAll(String(userId));
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the active workspace' })
  async getActive(@InitDataUser('id') userId: number) {
    return this.workspaceService.getActive(String(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace details' })
  async findOne(@Param('id') id: string, @InitDataUser('id') userId: number) {
    return this.workspaceService.findById(id, String(userId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  async create(@Body() dto: CreateWorkspaceDto, @InitDataUser('id') userId: number) {
    return this.workspaceService.create(dto, String(userId));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace settings' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto, @InitDataUser('id') userId: number) {
    return this.workspaceService.update(id, dto, String(userId));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace and its container' })
  async remove(@Param('id') id: string, @InitDataUser('id') userId: number) {
    return this.workspaceService.remove(id, String(userId));
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Set workspace as active' })
  async activate(@Param('id') id: string, @InitDataUser('id') userId: number) {
    return this.workspaceService.setActive(id, String(userId));
  }
}
