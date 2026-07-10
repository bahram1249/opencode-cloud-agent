import { Module } from '@nestjs/common';
import { BuildService } from './build.service';
import { OpenCodeModule } from '../opencode/opencode.module';

@Module({
  imports: [OpenCodeModule],
  providers: [BuildService],
  exports: [BuildService],
})
export class BuildModule {}
