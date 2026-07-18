import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFile, type ExecFileException } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

type Dockerode = new (options?: Record<string, unknown>) => {
  createContainer(options: Record<string, unknown>): Promise<{
    id: string;
    start(): Promise<void>;
    remove(options?: Record<string, unknown>): Promise<void>;
  }>;
  getContainer(id: string): {
    inspect(): Promise<{ State?: { Running?: boolean }; Id?: string }>;
    start(): Promise<void>;
    remove(options?: Record<string, unknown>): Promise<void>;
  };
  pull(repoTag: string): Promise<NodeJS.ReadableStream>;
  modem: {
    followProgress(stream: NodeJS.ReadableStream, cb: (err?: Error) => void): void;
  };
};

export interface WorkspaceContainerSpec {
  workspaceId: string;
  tenantId: string;
  workDir: string;
  providerId?: string | null;
  apiKey?: string | null;
  model?: string | null;
  githubToken?: string | null;
  githubLogin?: string | null;
}

interface DockerBackend {
  ensureContainer(spec: WorkspaceContainerSpec, name: string, env: string[]): Promise<string>;
  removeContainer(containerId: string): Promise<void>;
}

@Injectable()
export class DockerWorkspaceService {
  private readonly logger = new Logger(DockerWorkspaceService.name);
  private readonly image: string;
  private readonly backend: DockerBackend;

  constructor(private readonly config: ConfigService) {
    this.image = this.config.get<string>('app.workspaceImage', 'opencode-cloud-agent/workspace:latest');

    // Try dockerode first; fall back to docker CLI
    this.backend = this.tryDockerode() ?? this.createCliBackend();
    this.logger.log(`Docker backend: ${this.backend.constructor.name}`);
  }

  /** Try to initialise dockerode. Returns null if unavailable. */
  private tryDockerode(): DockerBackend | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Docker = require('dockerode') as Dockerode;
      // Auto-detect: Windows → named pipe, Unix → default socket.
      // The env var override only applies when not running on Windows
      // (on Windows the Unix socket path never works).
      const configuredSocket = this.config.get<string>('app.dockerSocket', '');
      const socketPath = platform() === 'win32'
        ? '//./pipe/docker_engine'
        : (configuredSocket || '/var/run/docker.sock');
      const docker = new Docker({ socketPath });
      this.logger.log(`Dockerode initialised (socket: ${socketPath})`);

      return {
        ensureContainer: async (spec, name, env) => {
          mkdirSync(spec.workDir, { recursive: true });
          this.writeOpenCodeConfig(spec);

          try {
            const existing = docker.getContainer(name);
            const inspected = await existing.inspect();
            const id = inspected.Id ?? name;
            if (!inspected.State?.Running) {
              this.logger.log(`Starting existing container ${name}...`);
              await existing.start();
            }
            await this.configureGitCredentials(id, spec);
            return id;
          } catch {
            return this.createContainerWithDockerode(docker, spec, name, env);
          }
        },
        removeContainer: async (containerId) => {
          try {
            await docker.getContainer(containerId).remove({ force: true });
          } catch (err) {
            this.logger.warn(`Failed to remove container ${containerId}: ${(err as Error).message}`);
          }
        },
      };
    } catch (err) {
      this.logger.warn(`Dockerode unavailable, falling back to docker CLI: ${(err as Error).message}`);
      return null;
    }
  }

  /** Create a container using dockerode. */
  private async createContainerWithDockerode(
    docker: InstanceType<Dockerode>,
    spec: WorkspaceContainerSpec,
    name: string,
    env: string[],
  ): Promise<string> {
    this.logger.log(`Creating container ${name} via dockerode...`);
    await this.pullImageIfNeededDockerode(docker);
    const container = await docker.createContainer({
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
    const id = container.id;
    this.logger.log(`Container ${id} created and started`);
    await this.configureGitCredentials(id, spec);
    return id;
  }

  private async pullImageIfNeededDockerode(docker: InstanceType<Dockerode>): Promise<void> {
    try {
      const stream = await docker.pull(this.image);
      await new Promise<void>((resolvePromise, reject) => {
        docker.modem.followProgress(stream, (err?: Error) => (err ? reject(err) : resolvePromise()));
      });
    } catch (err) {
      this.logger.warn(`Could not pull ${this.image}; may use a local image: ${(err as Error).message}`);
    }
  }

  /** Create a fallback backend that uses the docker CLI directly. */
  private createCliBackend(): DockerBackend {
    return {
      ensureContainer: async (spec, name, env) => {
        if (!(await this.checkDockerCli())) {
          throw new BadRequestException(
            'Docker is not available. Install Docker Desktop or ensure the docker CLI is in PATH.',
          );
        }
        mkdirSync(spec.workDir, { recursive: true });
        this.writeOpenCodeConfig(spec);

        try {
          const { stdout } = await execFileAsync('docker', ['inspect', name, '--format', '{{.Id}}']);
          const id = stdout.trim();
          const { stdout: status } = await execFileAsync('docker', ['inspect', name, '--format', '{{.State.Status}}']);
          if (status.trim() !== 'running') {
            this.logger.log(`Starting existing container ${name}...`);
            await execFileAsync('docker', ['start', name]);
          }
          await this.configureGitCredentials(id, spec);
          return id;
        } catch {
          return this.createContainerWithCli(spec, name, env);
        }
      },
      removeContainer: async (containerId) => {
        try {
          await execFileAsync('docker', ['rm', '-f', containerId]);
        } catch (err) {
          this.logger.warn(`Failed to remove container ${containerId}: ${(err as Error).message}`);
        }
      },
    };
  }

  /** Create a container using the docker CLI. */
  private async createContainerWithCli(
    spec: WorkspaceContainerSpec,
    name: string,
    env: string[],
  ): Promise<string> {
    this.logger.log(`Creating container ${name} via docker CLI...`);
    await this.pullImageIfNeededCli();
    const args = [
      'create',
      '--name', name,
      '--tty',
      '--interactive',
      '--workdir', '/workspace',
      ...env.flatMap(e => ['--env', e]),
      '--env', 'TERM=xterm-256color',
      '--label', `opencode-cloud-agent.workspaceId=${spec.workspaceId}`,
      '--label', `opencode-cloud-agent.tenantId=${spec.tenantId}`,
      '--volume', `${spec.workDir}:/workspace`,
      this.image,
      'sleep', 'infinity',
    ];
    const { stdout: containerId } = await execFileAsync('docker', args);
    const id = containerId.trim();
    await execFileAsync('docker', ['start', id]);
    this.logger.log(`Container ${id} created and started`);
    await this.configureGitCredentials(id, spec);
    return id;
  }

  private async pullImageIfNeededCli(): Promise<void> {
    try {
      await execFileAsync('docker', ['image', 'inspect', this.image]);
    } catch {
      try {
        await execFileAsync('docker', ['pull', this.image]);
      } catch (err) {
        this.logger.warn(`Could not pull ${this.image}: ${(err as Error).message}`);
      }
    }
  }

  /** Shared: configure git credentials inside a running container. */
  private async configureGitCredentials(containerId: string, spec: WorkspaceContainerSpec): Promise<void> {
    if (!spec.githubLogin || !spec.githubToken) return;
    try {
      await this.execInContainer(containerId, '/workspace', 'git', [
        'config', '--global', 'credential.helper',
        `!f() { echo "username=${spec.githubLogin}"; echo "password=${spec.githubToken}"; }; f`,
      ]);
    } catch (err) {
      this.logger.warn(`Failed to configure git credentials: ${(err as Error).message}`);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.config.get<boolean>('app.workspaceContainersEnabled', true);
  }

  async ensureContainer(spec: WorkspaceContainerSpec): Promise<string | null> {
    if (!this.isEnabled()) {
      this.logger.warn('ensureContainer skipped: WORKSPACE_CONTAINERS_ENABLED is false');
      return null;
    }
    const name = `opencode-ws-${spec.workspaceId}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const env = this.buildProviderEnv(spec);
    return this.backend.ensureContainer(spec, name, env);
  }

  async execInContainer(containerId: string, cwd: string, command: string, args: string[]): Promise<string> {
    const dockerArgs = ['exec', '-w', cwd, containerId, command, ...args];
    const { stdout } = await execFileAsync('docker', dockerArgs, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  }

  async removeContainer(containerId: string | null | undefined): Promise<void> {
    if (!containerId) return;
    await this.backend.removeContainer(containerId);
  }

  dockerExecArgs(containerId: string, cwd: string, command: string, args: string[]): string[] {
    const containerCwd = this.toContainerPath(cwd, cwd);
    return ['exec', '-i', '-t', '-w', containerCwd, containerId, command, ...args];
  }

  dockerExecNonInteractiveArgs(containerId: string, cwd: string, command: string, args: string[]): string[] {
    const containerCwd = this.toContainerPath(cwd, cwd);
    return ['exec', '-w', containerCwd, containerId, command, ...args];
  }

  resolveProjectContainerPath(projectPath: string): string {
    return projectPath === '.' ? '/workspace' : `/workspace/${projectPath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  toContainerPath(hostPath: string, hostWorkDir?: string): string {
    if (hostWorkDir) {
      const rel = relative(resolve(hostWorkDir), resolve(hostPath));
      if (rel.startsWith('..')) return '/workspace';
      return join('/workspace', rel).replace(/\\/g, '/');
    }
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
    const env: string[] = [];
    if (spec.githubToken) {
      env.push(`GITHUB_TOKEN=${spec.githubToken}`);
      if (spec.githubLogin) env.push(`GITHUB_USER=${spec.githubLogin}`);
    }
    if (spec.providerId && spec.apiKey) {
      const id = spec.providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      env.push(`${id}_API_KEY=${spec.apiKey}`);
    }
    return env;
  }

  private async checkDockerCli(): Promise<boolean> {
    try {
      await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
