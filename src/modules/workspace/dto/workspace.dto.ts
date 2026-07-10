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
}
