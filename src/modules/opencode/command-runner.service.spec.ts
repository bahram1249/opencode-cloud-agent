import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { CommandRunnerService } from 'src/modules/opencode/command-runner.service';

describe('CommandRunnerService', () => {
  let service: CommandRunnerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandRunnerService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              if (key === 'app.maxConcurrentTasks') return 3;
              if (key === 'app.taskTimeoutMs') return 0;
              return fallback;
            },
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CommandRunnerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should whitelist opencode command', () => {
    expect(service.isWhitelisted('opencode')).toBe(true);
  });

  it('should whitelist npm command', () => {
    expect(service.isWhitelisted('npm')).toBe(true);
  });

  it('should whitelist git command', () => {
    expect(service.isWhitelisted('git')).toBe(true);
  });

  it('should NOT whitelist arbitrary commands', () => {
    expect(service.isWhitelisted('rm')).toBe(false);
    expect(service.isWhitelisted('bash')).toBe(false);
    expect(service.isWhitelisted('curl')).toBe(false);
    expect(service.isWhitelisted('wget')).toBe(false);
  });

  it('should reject non-whitelisted commands', async () => {
    await expect(
      service.run({ command: 'rm', args: ['-rf', '/'], cwd: '/tmp' }),
    ).rejects.toThrow('not in the whitelist');
  });
});
