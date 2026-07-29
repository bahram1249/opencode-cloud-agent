import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramInitDataGuard } from './telegram-init-data.guard';

describe('TelegramInitDataGuard', () => {
  let guard: TelegramInitDataGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramInitDataGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'app.botToken') return 'test-bot-token-123';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    guard = module.get<TelegramInitDataGuard>(TelegramInitDataGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('validateInitData', () => {
    it('should throw on missing hash', () => {
      expect(() => guard.validateInitData('user=%7B%22id%22%3A123%7D')).toThrow(UnauthorizedException);
    });

    it('should throw on missing user', () => {
      expect(() => guard.validateInitData('query_id=abc&hash=def')).toThrow(UnauthorizedException);
    });

    it('should throw on invalid user JSON', () => {
      expect(() => guard.validateInitData('user=not-json&hash=abc')).toThrow(UnauthorizedException);
    });

    it('should throw on invalid signature', () => {
      expect(() => guard.validateInitData('user=%7B%22id%22%3A123%7D&hash=invalid')).toThrow(UnauthorizedException);
    });
  });

  describe('canActivate', () => {
    it('should throw on missing initData for HTTP context', () => {
      const mockContext = {
        getType: () => 'http' as const,
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      };

      expect(() => guard.canActivate(mockContext as never)).toThrow(UnauthorizedException);
    });

    it('should throw on missing initData for WS context', () => {
      const mockContext = {
        getType: () => 'ws' as const,
        switchToWs: () => ({
          getClient: () => ({ handshake: { query: {} } }),
        }),
      };

      expect(() => guard.canActivate(mockContext as never)).toThrow(UnauthorizedException);
    });
  });
});
