import { Test } from '@nestjs/testing';
import { GitCommandsService } from './git-commands.service';

describe('GitCommandsService', () => {
  let service: GitCommandsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GitCommandsService],
    }).compile();

    service = moduleRef.get(GitCommandsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
