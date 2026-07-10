import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigurationService } from './configuration.service';
import { CreateConfigurationDto, UpdateConfigurationDto } from './dto/configuration.dto';

@ApiTags('configuration')
@ApiBearerAuth()
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a configuration entry' })
  async create(@Body() dto: CreateConfigurationDto) {
    return this.configService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all configuration entries' })
  async findAll(@Query('scope') scope?: string) {
    return this.configService.findAll(scope);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a configuration entry by key' })
  async findByKey(@Param('key') key: string) {
    return this.configService.findByKey(key);
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Update a configuration entry' })
  async update(@Param('key') key: string, @Body() dto: UpdateConfigurationDto) {
    return this.configService.update(key, dto);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a configuration entry' })
  async remove(@Param('key') key: string) {
    return this.configService.remove(key);
  }
}
