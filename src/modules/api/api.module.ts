import { Module } from '@nestjs/common';
import { TelegramInitDataGuard } from 'src/common/guards/telegram-init-data.guard';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionModule } from '../session/session.module';
import { GitCommandsModule } from '../git-commands/git-commands.module';
import { GitAuthModule } from '../git-auth/git-auth.module';
import { WorkspacesController } from './workspaces.controller';
import { ProjectsController } from './projects.controller';
import { SessionsController } from './sessions.controller';
import { GitController } from './git.controller';
import { ModelsController } from './models.controller';

@Module({
  imports: [
    WorkspaceModule,
    SessionModule,
    GitCommandsModule,
    GitAuthModule,
  ],
  controllers: [
    WorkspacesController,
    ProjectsController,
    SessionsController,
    GitController,
    ModelsController,
  ],
  providers: [TelegramInitDataGuard],
  exports: [TelegramInitDataGuard],
})
export class ApiModule {}
