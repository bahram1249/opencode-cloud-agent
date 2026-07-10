import { Module } from '@nestjs/common';
import { OpenCodeService } from './opencode.service';
import { CommandRunnerService } from './command-runner.service';

@Module({
  providers: [CommandRunnerService, OpenCodeService],
  exports: [OpenCodeService, CommandRunnerService],
})
export class OpenCodeModule {}
