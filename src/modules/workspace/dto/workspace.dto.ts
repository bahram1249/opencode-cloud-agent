import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Unique workspace name', example: 'my-app' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ description: 'Absolute path to the workspace directory', example: '/home/user/projects/my-app' })
  @IsString()
  workDir!: string;

  @ApiPropertyOptional({ description: 'OpenCode provider id, such as opencode, anthropic, openai, github-copilot' })
  @IsString()
  @IsOptional()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Provider API key; used to configure the workspace container environment' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Default model in provider/model format' })
  @IsString()
  @IsOptional()
  model?: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ description: 'New display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'New working directory path' })
  @IsString()
  @IsOptional()
  workDir?: string;

  @ApiPropertyOptional({ description: 'Set as active workspace' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ description: 'OpenCode provider id' })
  @IsString()
  @IsOptional()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Provider API key to refresh container credentials' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Default model in provider/model format' })
  @IsString()
  @IsOptional()
  model?: string;
}

export class CreateProjectDto {
  @ApiProperty({ description: 'Project display name', example: 'backend' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ description: 'Absolute path to the git project', example: '/home/user/projects/my-app/backend' })
  @IsString()
  gitPath!: string;

  @ApiPropertyOptional({ description: 'Default branch', default: 'main' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ description: 'Remote URL' })
  @IsString()
  @IsOptional()
  remoteUrl?: string;

  @ApiPropertyOptional({ description: 'Git provider, for example github' })
  @IsString()
  @IsOptional()
  provider?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'New display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'New git path' })
  @IsString()
  @IsOptional()
  gitPath?: string;

  @ApiPropertyOptional({ description: 'Default branch' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ description: 'Remote URL' })
  @IsString()
  @IsOptional()
  remoteUrl?: string;

  @ApiPropertyOptional({ description: 'Whether the project is enabled' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Git provider, for example github' })
  @IsString()
  @IsOptional()
  provider?: string;
}
