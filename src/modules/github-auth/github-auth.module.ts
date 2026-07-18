import { Module } from '@nestjs/common';
import { GitHubAuthService } from './github-auth.service';
import { GitHubAuthController } from './github-auth.controller';
import { NotificationModule } from 'src/modules/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [GitHubAuthController],
  providers: [GitHubAuthService],
  exports: [GitHubAuthService],
})
export class GitHubAuthModule {}
