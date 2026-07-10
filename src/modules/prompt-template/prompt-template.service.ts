import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from 'src/database/prisma.module';
import { CreatePromptTemplateDto, UpdatePromptTemplateDto } from './dto/prompt-template.dto';

/**
 * Manages reusable prompt templates. Templates support {{variable}} mustache-
 * style interpolation. `render()` resolves a template by name and substitutes
 * provided variable values.
 */
@Injectable()
export class PromptTemplateService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(dto: CreatePromptTemplateDto) {
    return this.prisma.promptTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        template: dto.template,
        variables: dto.variables ?? '{}',
        category: dto.category ?? 'general',
        enabled: dto.enabled ?? true,
      },
    });
  }

  async findAll(category?: string) {
    return this.prisma.promptTemplate.findMany({
      where: category ? { category } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findByName(name: string) {
    return this.prisma.promptTemplate.findUnique({ where: { name } });
  }

  async update(name: string, dto: UpdatePromptTemplateDto) {
    return this.prisma.promptTemplate.update({ where: { name }, data: dto });
  }

  async remove(name: string) {
    return this.prisma.promptTemplate.delete({ where: { name } });
  }

  /**
   * Render a template by interpolating {{variable}} placeholders with the
   * provided values. Throws if the template doesn't exist or is disabled.
   */
  async render(name: string, variables: Record<string, string>): Promise<string> {
    const tpl = await this.findByName(name);
    if (!tpl) throw new NotFoundException(`Prompt template "${name}" not found`);
    if (!tpl.enabled) throw new NotFoundException(`Prompt template "${name}" is disabled`);

    return tpl.template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return variables[key] ?? '';
    });
  }
}
