import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceCrudService } from './workspace-crud.service';
import { ProjectService } from './project.service';
import { WorkspaceGitSyncService } from './workspace-git-sync.service';
import { DependencyInstallService } from './dependency-install.service';
import { GitCommandsModule } from 'src/modules/git-commands/git-commands.module';
import { DockerWorkspaceService } from './docker-workspace.service';

@Module({
  imports: [GitCommandsModule],
  controllers: [],
  providers: [
    WorkspaceService,
    WorkspaceCrudService,
    ProjectService,
    WorkspaceGitSyncService,
    DependencyInstallService,
    DockerWorkspaceService,
  ],
  exports: [
    WorkspaceService,
    WorkspaceCrudService,
    ProjectService,
    WorkspaceGitSyncService,
    DockerWorkspaceService,
  ],
})
export class WorkspaceModule {}
