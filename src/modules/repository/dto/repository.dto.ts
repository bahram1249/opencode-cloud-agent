import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateRepositoryDto {
  @ApiProperty({ description: 'Unique slug', example: 'my-project' })
  @IsString()
  slug!: string;

  @ApiProperty({ description: 'Display name', example: 'My Project' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Absolute path to the repo', example: '/home/user/my-project' })
  @IsString()
  path!: string;

  @ApiPropertyOptional({ description: 'Default branch', example: 'main', default: 'main' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ description: 'Build command', example: 'npm run build' })
  @IsString()
  @IsOptional()
  buildCommand?: string;

  @ApiPropertyOptional({ description: 'Test command', example: 'npm test' })
  @IsString()
  @IsOptional()
  testCommand?: string;

  @ApiPropertyOptional({ description: 'Lint command', example: 'npm run lint' })
  @IsString()
  @IsOptional()
  lintCommand?: string;

  @ApiPropertyOptional({ description: 'Typecheck command', example: 'npm run typecheck' })
  @IsString()
  @IsOptional()
  typecheckCommand?: string;

  @ApiPropertyOptional({ description: 'Install command', example: 'npm install' })
  @IsString()
  @IsOptional()
  installCommand?: string;

  @ApiPropertyOptional({ description: 'Approval policy', example: 'required' })
  @IsString()
  @IsOptional()
  approvalPolicy?: string;

  @ApiPropertyOptional({ description: 'Remote URL override' })
  @IsString()
  @IsOptional()
  remoteUrl?: string;
}

export class UpdateRepositoryDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Absolute path to the repo' })
  @IsString()
  @IsOptional()
  path?: string;

  @ApiPropertyOptional({ description: 'Default branch' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ description: 'Build command' })
  @IsString()
  @IsOptional()
  buildCommand?: string;

  @ApiPropertyOptional({ description: 'Test command' })
  @IsString()
  @IsOptional()
  testCommand?: string;

  @ApiPropertyOptional({ description: 'Lint command' })
  @IsString()
  @IsOptional()
  lintCommand?: string;

  @ApiPropertyOptional({ description: 'Typecheck command' })
  @IsString()
  @IsOptional()
  typecheckCommand?: string;

  @ApiPropertyOptional({ description: 'Install command' })
  @IsString()
  @IsOptional()
  installCommand?: string;

  @ApiPropertyOptional({ description: 'Approval policy' })
  @IsString()
  @IsOptional()
  approvalPolicy?: string;

  @ApiPropertyOptional({ description: 'Remote URL override' })
  @IsString()
  @IsOptional()
  remoteUrl?: string;

  @ApiPropertyOptional({ description: 'Whether the repository is enabled' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class RepositoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter enabled repos', default: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;
}
