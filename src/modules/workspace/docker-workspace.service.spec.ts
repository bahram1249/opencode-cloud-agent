import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DockerWorkspaceService } from './docker-workspace.service';

describe('DockerWorkspaceService', () => {
  let service: DockerWorkspaceService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerWorkspaceService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-image') } },
      ],
    }).compile();

    service = moduleRef.get(DockerWorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toContainerPath', () => {
    it('should convert host path to container path', () => {
      const result = service.toContainerPath(
        '/data/workspaces/tenant-1/my-ws/my-project',
        '/data/workspaces/tenant-1/my-ws',
      );
      expect(result).toBe('/workspace/my-project');
    });

    it('should return /workspace when path equals workDir', () => {
      const result = service.toContainerPath(
        '/data/workspaces/tenant-1/my-ws',
        '/data/workspaces/tenant-1/my-ws',
      );
      expect(result).toBe('/workspace');
    });

    it('should fall back to /workspace when path is outside workDir', () => {
      const result = service.toContainerPath(
        '/some/other/path',
        '/data/workspaces/tenant-1/my-ws',
      );
      expect(result).toBe('/workspace');
    });
  });
});
