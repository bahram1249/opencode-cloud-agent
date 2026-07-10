import { Module } from '@nestjs/common';
import { GitCommandsService } from './git-commands.service';

@Module({
  providers: [GitCommandsService],
  exports: [GitCommandsService],
})
export class GitCommandsModule {}
