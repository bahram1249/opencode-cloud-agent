import { Module } from '@nestjs/common';
import { GitAuthService } from './git-auth.service';

@Module({
  providers: [GitAuthService],
  exports: [GitAuthService],
})
export class GitAuthModule {}
