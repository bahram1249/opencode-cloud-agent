import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromptTemplateService } from './prompt-template.service';
import {
  CreatePromptTemplateDto,
  RenderPromptDto,
  UpdatePromptTemplateDto,
} from './dto/prompt-template.dto';

@ApiTags('prompt-templates')
@ApiBearerAuth()
@Controller('prompt-templates')
export class PromptTemplateController {
  constructor(private readonly templateService: PromptTemplateService) {}

  @Post()
  @ApiOperation({ summary: 'Create a prompt template' })
  async create(@Body() dto: CreatePromptTemplateDto) {
    return this.templateService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all prompt templates' })
  async findAll(@Query('category') category?: string) {
    return this.templateService.findAll(category);
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a prompt template by name' })
  async findByName(@Param('name') name: string) {
    return this.templateService.findByName(name);
  }

  @Patch(':name')
  @ApiOperation({ summary: 'Update a prompt template' })
  async update(@Param('name') name: string, @Body() dto: UpdatePromptTemplateDto) {
    return this.templateService.update(name, dto);
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Delete a prompt template' })
  async remove(@Param('name') name: string) {
    return this.templateService.remove(name);
  }

  @Post('render')
  @ApiOperation({ summary: 'Render a prompt template with variables' })
  async render(@Body() dto: RenderPromptDto) {
    const variables = JSON.parse(dto.variables) as Record<string, string>;
    const rendered = await this.templateService.render(dto.name, variables);
    return { name: dto.name, rendered };
  }
}
