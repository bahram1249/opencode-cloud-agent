import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { CurrentInitDataUser as InitDataUser } from 'src/common/decorators/init-data-user.decorator';
import { WorkspaceService } from '../workspace/workspace.service';

@ApiTags('Models')
@ApiBearerAuth()
@UseGuards(TelegramInitDataGuard)
@Controller('workspaces')
export class ModelsController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':id/models')
  @ApiOperation({ summary: 'List available models for a workspace' })
  async listModels(
    @Param('id') id: string,
    @Query('providerId') providerId: string | undefined,
    @InitDataUser('id') userId: number,
  ) {
    return this.workspaceService.listOpenCodeModels(id, String(userId), providerId);
  }
}
