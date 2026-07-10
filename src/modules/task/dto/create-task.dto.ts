import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ description: 'Natural language prompt for OpenCode', example: 'Fix issue #52' })
  @IsString()
  @Length(1, 10000)
  prompt!: string;

  @ApiPropertyOptional({ description: 'Repository slug to operate on', example: 'my-project' })
  @IsString()
  @IsOptional()
  repositorySlug?: string;

  @ApiPropertyOptional({ description: 'OpenCode profile name to use', example: 'default' })
  @IsString()
  @IsOptional()
  opencodeProfile?: string;

  @ApiPropertyOptional({ description: 'Telegram user ID of the requester', example: 123456789 })
  @IsInt()
  @Min(1)
  @IsOptional()
  telegramUserId?: number;

  @ApiPropertyOptional({ description: 'File attachment paths', type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];

  @ApiPropertyOptional({ description: 'Maximum retry attempts', example: 1, default: 1 })
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}

export class RetryTaskDto {
  @ApiPropertyOptional({ description: 'Override the prompt for this retry' })
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  prompt?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ description: 'New workflow state', example: 'coding' })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ description: 'Reason for the transition' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class TaskQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by repository slug' })
  @IsString()
  @IsOptional()
  repositorySlug?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}
