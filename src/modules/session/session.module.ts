import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { StreamModule } from '../stream/stream.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [WorkspaceModule, StreamModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
