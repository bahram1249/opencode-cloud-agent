import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'Prompt to start the session with', example: 'Fix the login bug' })
  @IsString()
  @Length(1, 10000)
  prompt!: string;

  @ApiPropertyOptional({ description: 'Workspace name or id to run in' })
  @IsString()
  @IsOptional()
  workspaceName?: string;

  @ApiPropertyOptional({ description: 'OpenCode profile to use' })
  @IsString()
  @IsOptional()
  opencodeProfile?: string;

  @ApiPropertyOptional({ description: 'Enable live streaming to Telegram (default: true)' })
  @IsBoolean()
  @IsOptional()
  streaming?: boolean;
}

export class SendToSessionDto {
  @ApiProperty({ description: 'Text to send to the running session', example: 'Also update the tests' })
  @IsString()
  @Length(1, 10000)
  text!: string;
}

export class SessionQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Filter by user' })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiProperty({ description: 'Page number', default: 1 })
  @IsInt()
  @IsOptional()
  page?: number;

  @ApiProperty({ description: 'Page size', default: 20 })
  @IsInt()
  @IsOptional()
  pageSize?: number;
}
