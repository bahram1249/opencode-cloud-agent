import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { GitCommandsModule } from 'src/modules/git-commands/git-commands.module';
import { DockerWorkspaceService } from './docker-workspace.service';

@Module({
  imports: [GitCommandsModule],
  controllers: [],
  providers: [WorkspaceService, DockerWorkspaceService],
  exports: [WorkspaceService, DockerWorkspaceService],
})
export class WorkspaceModule {}
