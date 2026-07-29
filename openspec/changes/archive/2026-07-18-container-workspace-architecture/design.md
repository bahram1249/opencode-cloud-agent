## Context

The opencode-orchestrator currently supports both host-directory and Docker container workspace modes, with the container mode bolted on as optional. The `DockerWorkspaceService` handles container lifecycle but the git operations (`GitCommandsService`) run on the host directly, unauthenticated. Tenant `githubToken` exists in the Prisma model but is never plumbed into git operations. Workspace paths are user-provided, causing confusion between host paths and the container's `/workspace`.

This design re-architects the system to be container-first: every workspace runs in a dedicated Docker container, git operations run inside the container with the tenant's GitHub credentials, and the `/workspace` path is fixed.

### Current Architecture

```
Telegram ─▶ WorkspaceService (host paths)
              ├── DockerWorkspaceService (optional container)
              └── GitCommandsService (host, no auth)
              └── SessionService (PTY: host or docker exec)
```

### Target Architecture

```
Telegram ─▶ WorkspaceService (host paths auto-assigned)
              └── DockerWorkspaceService (required container)
              └── GitCommandsService ─▶ DockerWorkspaceService (all ops via docker exec)
              └── SessionService (PTY: always docker exec)
```

## Goals / Non-Goals

**Goals:**
- Every workspace has a dedicated Docker container with `/workspace` as the working directory
- Git operations (clone, pull, push, commit, status, diff, log) run inside the container authenticated as the tenant's GitHub user
- Projects are automatically cloned on add and pulled when the container starts
- The `workDir` field is auto-assigned by the system (no longer user-configurable)
- Existing workspaces are migrated to the new model

**Non-Goals:**
- Supporting non-Docker runtime environments (e.g., bare-metal, Kubernetes) — out of scope for this change
- Multi-container workspaces (one container per workspace, always)
- SSH-based git auth (GitHub token only)
- Git hosting beyond GitHub (provider field retained for future use)
- Persistent shell sessions or interactive terminals inside the container beyond `docker exec`

## Decisions

### Decision 1: Git Auth Strategy — GITHUB_TOKEN environment variable with credential helper

**Choice:** Inject `GITHUB_TOKEN` as a container environment variable and configure git's credential helper to read it.

**How it works:**
1. On `ensureContainer()`, pass `GITHUB_TOKEN=<token>` and `GITHUB_USER=<login>` in the container's `Env`
2. Before any git operation, run `git config --global credential.helper '!f() { echo "username=$GITHUB_USER"; echo "password=$GITHUB_TOKEN"; }; f'`
3. All subsequent git operations use this helper transparently

**Alternatives considered:**
- *Embedded URL (https://TOKEN@github.com/...)*: Rejected — token leaks in `git log`, `ps aux`, error messages, and stored remote URLs
- *Credential store file on disk*: Viable but the env-based helper avoids writing tokens to disk and works across container restarts without persistence
- *SSH deploy keys*: Overkill for per-tenant auth; requires key generation and GitHub API key registration per workspace

**Trade-off:** The env variable is visible via `docker inspect` and `/proc` on the host. Acceptable for a single-tenant-per-container model.

### Decision 2: Auto-Assigned Host Path Pattern

**Choice:** Auto-assign host path as `{workspaceRoot}/{tenantId}/{workspaceName}` (sanitized).

**How it works:**
- `workspaceRoot` defaults to `/data/workspaces` (configurable via env)
- Path is generated in `WorkspaceService.create()` and stored in `workspace.workDir`
- This host path is mounted to `/workspace` in the container
- The user never sees or sets the path

**Alternatives considered:**
- *Keep user-provided path for host, always `/workspace` in container*: Adds complexity of two-path tracking and confuses users
- *No host path (volume-only)*: Not possible — Docker requires a bind-mount source

**Trade-off:** Path changes on workspace rename. Acceptable — rename is rare and the old host path can be cleaned up.

### Decision 3: Git Operations Migrate Inside Container

**Choice:** `GitCommandsService` gains a `containerId` parameter. When present, all git commands run via `docker exec` inside the container instead of on the host.

**How it works:**
```typescript
// GitCommandsService
async exec(gitArgs: string[], cwd: string, containerId?: string): Promise<string> {
  if (containerId) {
    return execDockerExec(containerId, cwd, 'git', gitArgs);
  }
  return execFile('git', gitArgs, { cwd });
}
```

Container path conversion: all `cwd` paths are relative to `/workspace` inside the container. `DockerWorkspaceService.toContainerPath()` handles conversion.

**Alternatives considered:**
- *Run git on host via bind-mount access*: Works but skips auth setup (credentials are inside the container)
- *Dedicated git daemon container*: Over-engineered for this use case

### Decision 4: Pull-on-Start Strategy — Orchestrator-Managed

**Choice:** `syncProjects()` is called explicitly when needed (session create, `ensureContainer()`, explicit sync command) rather than via container entrypoint.

**Rationale:**
- The orchestrator already has the project list and auth context
- Container entrypoints are harder to debug and update
- The orchestrator can report sync results back to the user
- Entrypoint approach would require a custom image with a sync script

**Exception:** Git credential helper config IS set in the container entrypoint logic (via `docker exec` after container start), so credentials are always available.

### Decision 5: Docker Socket Mapping

**Choice:** The app container mounts the Docker socket to create sibling containers.

The `docker-compose.yml` will add:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

This allows the orchestrator to create/manage workspace containers alongside itself.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Docker socket access gives container root-level host access | Run orchestrator in a restricted container; consider Docker-in-Docker or remote Docker API as future hardening |
| Container image missing `git` or credentials fail | `opencode-workspace.Dockerfile` installs git; add tests for git availability |
| Token rotation — user revokes token | Next git operation fails with clear auth error; prompt user to re-auth via `/login github` |
| Workspace rename changes host path | Clean up old host dir on rename; update volume mount (requires container restart) |
| `docker exec` latency vs direct git | Negligible for CLI operations; if problematic, consider long-running containers |
| Orphaned containers on crash | `removeContainer()` on workspace delete; add periodic cleanup daemon for stale containers |

## Migration Plan

1. **Deploy steps:**
   - Add Prisma migration for `githubLogin` field on Tenant
   - Update `DockerWorkspaceService` to inject `GITHUB_TOKEN`/`GITHUB_USER` env vars
   - Add `containerId`-aware execution to `GitCommandsService`
   - Update `WorkspaceService.create()` to auto-assign host path and remove `workDir` from DTO
   - Update `WorkspaceService.addProject()` and `syncProjects()` to use container git exec
   - Update `SessionService` to always ensure container (no host fallback)
   - Update `docker-compose.yml` with Docker socket mount
   - Write migration script to create containers for existing workspaces

2. **Rollback:**
   - Revert `workspaceContainersEnabled` config to allow `false`
   - Revert `GitCommandsService` to host-only execution
   - Restore `workDir` field on `CreateWorkspaceDto`

## Open Questions

1. Should `workspaceContainersEnabled` remain as a config flag (default `true`) or be removed entirely? Keeping it eases local development without Docker.
2. What happens to the `toContainerPath()` helper when there's no container (host mode)? Should fall back to identity mapping.
3. Should we add a `docker ps`-style health check for workspace containers (is the container actually running)?
4. For existing workspaces at migration time: do we create containers immediately, or lazily on first session?
