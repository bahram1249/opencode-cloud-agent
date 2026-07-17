import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// dockerode is intentionally loaded dynamically so the API can still boot in
// environments where Docker support has not been installed/enabled yet.
type Dockerode = new (options?: Record<string, unknown>) => {
  createContainer(options: Record<string, unknown>): Promise<DockerContainer>;
  getContainer(id: string): DockerContainer;
  pull(repoTag: string): Promise<NodeJS.ReadableStream>;
  modem: {
    followProgress(stream: NodeJS.ReadableStream, cb: (err?: Error) => void): void;
  };
};

type DockerContainer = {
  id: string;
  inspect(): Promise<{ State?: { Running?: boolean }; Id?: string }>;
  start(): Promise<void>;
  remove(options?: Record<string, unknown>): Promise<void>;
};

export interface WorkspaceContainerSpec {
  workspaceId: string;
  tenantId: string;
  workDir: string;
  providerId?: string | null;
  apiKey?: string | null;
  model?: string | null;
}

@Injectable()
export class DockerWorkspaceService {
  private readonly logger = new Logger(DockerWorkspaceService.name);
  private readonly docker?: InstanceType<Dockerode>;
  private readonly image: string;

  constructor(private readonly config: ConfigService) {
    this.image = this.config.get<string>('app.workspaceImage', 'opencode-cloud-agent/workspace:latest');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Docker = require('dockerode') as Dockerode;
      this.docker = new Docker({ socketPath: this.config.get<string>('app.dockerSocket', '/var/run/docker.sock') });
    } catch (err) {
      this.logger.warn(`Dockerode unavailable: ${(err as Error).message}`);
    }
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('app.workspaceContainersEnabled', true) && !!this.docker;
  }

  async ensureContainer(spec: WorkspaceContainerSpec): Promise<string | null> {
    if (!this.isEnabled() || !this.docker) return null;
    mkdirSync(spec.workDir, { recursive: true });
    this.writeOpenCodeConfig(spec);

    const name = `opencode-ws-${spec.workspaceId}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const env = this.buildProviderEnv(spec);

    try {
      const existing = this.docker.getContainer(name);
      const inspected = await existing.inspect();
      if (!inspected.State?.Running) await existing.start();
      return inspected.Id ?? name;
    } catch {
      // create below
    }

    await this.pullImageIfNeeded();
    const container = await this.docker.createContainer({
      name,
      Image: this.image,
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/workspace',
      Env: [...env, 'TERM=xterm-256color'],
      Cmd: ['sleep', 'infinity'],
      HostConfig: {
        AutoRemove: false,
        Binds: [`${spec.workDir}:/workspace`],
      },
      Labels: {
        'opencode-cloud-agent.workspaceId': spec.workspaceId,
        'opencode-cloud-agent.tenantId': spec.tenantId,
      },
    });
    await container.start();
    return container.id;
  }

  async removeContainer(containerId: string | null | undefined): Promise<void> {
    if (!containerId || !this.docker) return;
    try {
      await this.docker.getContainer(containerId).remove({ force: true });
    } catch (err) {
      this.logger.warn(`Failed to remove workspace container ${containerId}: ${(err as Error).message}`);
    }
  }

  dockerExecArgs(containerId: string, cwd: string, command: string, args: string[]): string[] {
    const containerCwd = this.toContainerPath(cwd);
    return ['exec', '-i', '-t', '-w', containerCwd, containerId, command, ...args];
  }

  dockerExecNonInteractiveArgs(containerId: string, cwd: string, command: string, args: string[]): string[] {
    const containerCwd = this.toContainerPath(cwd);
    return ['exec', '-i', '-w', containerCwd, containerId, command, ...args];
  }

  toContainerPath(hostPath: string): string {
    const rel = relative(resolve('/workspace'), resolve(hostPath));
    if (rel.startsWith('..')) return '/workspace';
    return join('/workspace', rel).replace(/\\/g, '/');
  }

  private writeOpenCodeConfig(spec: WorkspaceContainerSpec): void {
    const config: Record<string, unknown> = { $schema: 'https://opencode.ai/config.json' };
    if (spec.model) config.model = spec.model;
    if (spec.providerId) config.provider = { [spec.providerId]: {} };
    writeFileSync(join(spec.workDir, 'opencode.json'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  private buildProviderEnv(spec: WorkspaceContainerSpec): string[] {
    if (!spec.providerId || !spec.apiKey) return [];
    const id = spec.providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return [`${id}_API_KEY=${spec.apiKey}`];
  }

  private async pullImageIfNeeded(): Promise<void> {
    if (!this.docker) throw new BadRequestException('Docker is not available');
    try {
      const stream = await this.docker.pull(this.image);
      await new Promise<void>((resolvePromise, reject) => {
        this.docker?.modem.followProgress(stream, (err?: Error) => (err ? reject(err) : resolvePromise()));
      });
    } catch (err) {
      this.logger.warn(`Could not pull ${this.image}; Docker may use a local image: ${(err as Error).message}`);
    }
  }
}
