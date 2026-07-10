import { Test } from '@nestjs/testing';
import { PromptTemplateService } from 'src/modules/prompt-template/prompt-template.service';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;
  let prisma: {
    promptTemplate: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      promptTemplate: {
        create: jest.fn().mockResolvedValue({ id: '1', name: 'fix-issue' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PromptTemplateService,
        { provide: 'PRISMA_CLIENT', useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PromptTemplateService);
  });

  it('should render a template with variables', async () => {
    prisma.promptTemplate.findUnique.mockResolvedValue({
      name: 'fix-issue',
      template: 'Fix issue #{{issue}} in the repo.',
      enabled: true,
    });
    const result = await service.render('fix-issue', { issue: '52' });
    expect(result).toBe('Fix issue #52 in the repo.');
  });

  it('should throw if template not found', async () => {
    prisma.promptTemplate.findUnique.mockResolvedValue(null);
    await expect(service.render('nonexistent', {})).rejects.toThrow('not found');
  });

  it('should throw if template is disabled', async () => {
    prisma.promptTemplate.findUnique.mockResolvedValue({
      name: 'disabled-template',
      template: 'test',
      enabled: false,
    });
    await expect(service.render('disabled-template', {})).rejects.toThrow('disabled');
  });

  it('should handle multiple variables', async () => {
    prisma.promptTemplate.findUnique.mockResolvedValue({
      name: 'multi',
      template: '{{a}} and {{b}} and {{c}}',
      enabled: true,
    });
    const result = await service.render('multi', { a: '1', b: '2', c: '3' });
    expect(result).toBe('1 and 2 and 3');
  });

  it('should replace missing variables with empty string', async () => {
    prisma.promptTemplate.findUnique.mockResolvedValue({
      name: 'partial',
      template: 'Hello {{name}}, {{missing}} world',
      enabled: true,
    });
    const result = await service.render('partial', { name: 'Alice' });
    expect(result).toBe('Hello Alice,  world');
  });
});
