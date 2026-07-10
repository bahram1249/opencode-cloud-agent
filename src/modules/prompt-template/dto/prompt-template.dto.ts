import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreatePromptTemplateDto {
  @ApiProperty({ description: 'Unique template name', example: 'fix-issue' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Template body with {{variable}} placeholders',
    example: 'Fix issue #{{issue}} in the repository. Read the issue description and implement the fix.',
  })
  @IsString()
  @Length(1, 20000)
  template!: string;

  @ApiPropertyOptional({
    description: 'JSON object of variable definitions',
    example: '{"issue":"number"}',
    default: '{}',
  })
  @IsString()
  @IsOptional()
  variables?: string;

  @ApiPropertyOptional({ description: 'Category', example: 'general', default: 'general' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Whether the template is enabled', default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdatePromptTemplateDto {
  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Template body' })
  @IsString()
  @IsOptional()
  template?: string;

  @ApiPropertyOptional({ description: 'JSON variables' })
  @IsString()
  @IsOptional()
  variables?: string;

  @ApiPropertyOptional({ description: 'Category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Whether the template is enabled' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class RenderPromptDto {
  @ApiProperty({ description: 'Template name to render', example: 'fix-issue' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Variable values as key/value pairs',
    example: '{"issue":"52"}',
  })
  @IsString()
  variables!: string;
}
