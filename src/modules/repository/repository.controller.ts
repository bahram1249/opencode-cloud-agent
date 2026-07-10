import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RepositoryService } from './repository.service';
import { CreateRepositoryDto, UpdateRepositoryDto, RepositoryQueryDto } from './dto/repository.dto';

@ApiTags('repositories')
@ApiBearerAuth()
@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new repository' })
  async create(@Body() dto: CreateRepositoryDto) {
    return this.repositoryService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all repositories' })
  async findAll(@Query() query: RepositoryQueryDto) {
    return this.repositoryService.findAll(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a repository by slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.repositoryService.findBySlug(slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a repository' })
  async update(@Param('id') id: string, @Body() dto: UpdateRepositoryDto) {
    return this.repositoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a repository' })
  async remove(@Param('id') id: string) {
    return this.repositoryService.remove(id);
  }
}
