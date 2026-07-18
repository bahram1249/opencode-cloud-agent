import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitHubAuthService } from './github-auth.service';
import { PRISMA_CLIENT } from 'src/database/prisma.module';

describe('GitHubAuthService', () => {
  let service: GitHubAuthService;

  beforeEach(async () => {
    const mockPrisma = {
      tenant: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ githubToken: 'test-token' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as never;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GitHubAuthService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        { provide: PRISMA_CLIENT, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get(GitHubAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('isConfigured should return false when clientId/secret are empty', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('generateAuthUrl should return a GitHub OAuth URL', () => {
    const url = service.generateAuthUrl('user-1', 'chat-1');
    expect(url).toContain('https://github.com/login/oauth/authorize');
    expect(url).toContain('client_id=');
    expect(url).toContain('state=');
    expect(url).toContain('scope=repo%2Cuser');
  });
});
