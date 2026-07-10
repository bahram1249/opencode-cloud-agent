import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateConfigurationDto {
  @ApiProperty({ description: 'Configuration key', example: 'opencode.defaultProfile' })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'Configuration value', example: 'default' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ description: 'Scope grouping', example: 'global', default: 'global' })
  @IsString()
  @IsOptional()
  scope?: string;

  @ApiPropertyOptional({ description: 'Repository id this config belongs to' })
  @IsString()
  @IsOptional()
  repositoryId?: string;
}

export class UpdateConfigurationDto {
  @ApiPropertyOptional({ description: 'Configuration value' })
  @IsString()
  @IsOptional()
  value?: string;

  @ApiPropertyOptional({ description: 'Scope grouping' })
  @IsString()
  @IsOptional()
  scope?: string;
}
