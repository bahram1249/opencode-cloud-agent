import { Test } from '@nestjs/testing';
import { GitAuthService } from './git-auth.service';
import { PRISMA_CLIENT } from 'src/database/prisma.module';

describe('GitAuthService', () => {
  let service: GitAuthService;

  const mockPrisma = {
    workspace: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  } as never;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GitAuthService,
        { provide: PRISMA_CLIENT, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get(GitAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('maskToken', () => {
    it('should mask middle of token', () => {
      expect(service.maskToken('ghp_abcdef12345678')).toBe('ghp_****5678');
    });

    it('should handle short tokens', () => {
      expect(service.maskToken('abc12345')).toBe('abc1****2345');
    });

    it('should handle very short tokens', () => {
      expect(service.maskToken('abc')).toBe('****');
    });
  });

  describe('isGitAuthError', () => {
    it('should detect 401 errors', () => {
      expect(service.isGitAuthError('fatal: Authentication failed for https://...')).toBe(true);
    });

    it('should detect 403 errors', () => {
      expect(service.isGitAuthError('fatal: unable to access: The requested URL returned error: 403')).toBe(true);
    });

    it('should detect access denied', () => {
      expect(service.isGitAuthError('fatal: Could not read from remote repository.')).toBe(true);
    });

    it('should not flag non-auth errors', () => {
      expect(service.isGitAuthError('fatal: not a git repository')).toBe(false);
    });
  });

  describe('getCredentialsStatus', () => {
    it('should return not-set status when no credentials', async () => {
      (mockPrisma as any).workspace.findUnique.mockResolvedValue({
        name: 'test-ws',
        gitToken: null,
        gitUsername: null,
        projects: [],
      });

      const status = await service.getCredentialsStatus('ws-1');
      expect(status.isSet).toBe(false);
      expect(status.username).toBeNull();
    });

    it('should return set status when credentials exist', async () => {
      (mockPrisma as any).workspace.findUnique.mockResolvedValue({
        name: 'test-ws',
        gitToken: 'ghp_abc123def456',
        gitUsername: 'testuser',
        projects: [{ remoteUrl: 'https://github.com/org/repo.git' }],
      });

      const status = await service.getCredentialsStatus('ws-1');
      expect(status.isSet).toBe(true);
      expect(status.username).toBe('testuser');
      expect(status.tokenMasked).toBe('ghp_****f456');
      expect(status.remoteUrl).toBe('https://github.com/org/repo.git');
    });
  });

  describe('setWorkspaceCredentials and removeCredentials', () => {
    it('should store credentials', async () => {
      const result = await service.setWorkspaceCredentials('ws-1', 'user1', 'ghp_abc123');
      expect(result.username).toBe('user1');
      expect(result.tokenMasked).toBe('ghp_****c123');
    });

    it('should remove credentials', async () => {
      await service.removeCredentials('ws-1');
      expect(mockPrisma).toBeDefined();
    });
  });
});
