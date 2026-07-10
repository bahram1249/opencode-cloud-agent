import { Module } from '@nestjs/common';
import { WorkflowEngine } from './workflow-engine.service';
import { WorkflowOrchestrator } from './workflow-orchestrator.service';
import { TaskModule } from '../task/task.module';
import { OpenCodeModule } from '../opencode/opencode.module';
import { BuildModule } from '../build/build.module';
import { GitModule } from '../git/git.module';
import { NotificationModule } from '../notification/notification.module';
import { RepositoryModule } from '../repository/repository.module';

@Module({
  imports: [TaskModule, OpenCodeModule, BuildModule, GitModule, NotificationModule, RepositoryModule],
  providers: [WorkflowEngine, WorkflowOrchestrator],
  exports: [WorkflowEngine, WorkflowOrchestrator],
})
export class WorkflowModule {}
