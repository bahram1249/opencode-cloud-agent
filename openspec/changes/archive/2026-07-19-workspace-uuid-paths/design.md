## Context

Currently, workspace directories are created at `{WORKSPACE_ROOT}/{tenantId}/{workspaceName}`. `WORKSPACE_ROOT` defaults to `/workspace` in `app.config.ts`, which fails on macOS (requires root) and is meaningless on Windows. The path includes `workspaceName`, making it change on rename. The path also leaks the tenant database ID.

The `.env.example` documents `WORKSPACE_ROOT=/data/workspaces` — which only works when running inside Docker via docker-compose (where `./workspaces:/data/workspaces` is mounted). Native macOS/Windows runs need a writable path outside the project directory.

## Goals / Non-Goals

**Goals:**
- Workspace creation succeeds on macOS, Linux, and Windows without configuration
- Default workspace root is outside the project directory (survives CI/CD clean)
- Workspace path is stable across renames (no `name` in path)
- Workspace path is unique per workspace (UUID-based)
- Path is stored in DB `workDir` field — container mounts use the same path
- `WORKSPACE_ROOT` env var remains configurable for Docker compose deployments

**Non-Goals:**
- No changes to the existing container mount contract (`workDir:/workspace`)
- No changes to the Prisma schema (fields already exist)
- No migration of existing workspace paths (backwards compatible — old paths still work for existing records)
- Not changing the Docker compose workflow (still uses `WORKSPACE_ROOT=/data/workspaces`)

## Decisions

### Decision 1: Workspace ID is pre-generated and used as path segment

Instead of letting Prisma auto-generate the `id` (cuid), the `create()` method generates a UUID (v4) first, uses it to construct the path, then passes it as the workspace ID on insert.

```
Before (brittle):
  path = join(ROOT, tenant.id, sanitizedName)
  → /data/workspaces/cmrq...abc/ariakish

After (stable):
  wsId = crypto.randomUUID()
  path = join(ROOT, tenant.id, wsId)
  → /data/workspaces/cmrq...abc/a7f3b2c1-4d5e-...
```

Rationale:
- The `Workspace.id` field is `@default(cuid())` but accepts explicit values
- No schema migration needed
- UUID is universally unique, no collision risk
- Path is independent of `name` — renames don't break paths
- `tenant.id` in path provides logical grouping per user

### Decision 2: Cross-platform default for WORKSPACE_ROOT

The default changes from `/workspace` (Unix-only) to a platform-appropriate path:

| Platform | Default Path |
|---|---|
| macOS | `~/Library/Application Support/opencode-orchestrator/workspaces` |
| Linux | `~/.local/share/opencode-orchestrator/workspaces` |
| Windows | `%APPDATA%/opencode-orchestrator/workspaces` |

Rationale:
- All these paths are user-writable without admin/sudo
- All are outside the project directory → survive CI/CD clean
- Follows OS conventions (XDG on Linux, Application Support on macOS, APPDATA on Windows)
- Overridable via `WORKSPACE_ROOT` env var for Docker deployments

### Decision 3: Root directory created at app bootstrap

The workspace root directory is created with `mkdirSync({ recursive: true })` at app startup (in the config factory or an `OnModuleInit`). This ensures the root exists before any workspace creation attempt.

Rationale:
- Prevents ENOENT errors at workspace creation time
- `mkdirSync` with `recursive: true` is idempotent — safe if directory already exists
- Runs once at startup, not per-workspace-creation

### Decision 4: Docker compose users set WORKSPACE_ROOT explicitly

The `.env.example` already documents `WORKSPACE_ROOT=/data/workspaces`. This continues to work unchanged. The docker-compose.yml mounts `./workspaces:/data/workspaces` for persistence.

No changes to `docker-compose.yml` or `Dockerfile` needed.

## Risks / Trade-offs

- [Cleanup on delete] When a workspace is deleted, its directory on disk is not removed. Currently `workspace.service.ts:remove()` only removes the DB record and Docker container. Leftover directories could accumulate. → Mitigation: Acceptable for now. Add cleanup as a separate task if needed.
- [Existing workspaces] Existing workspaces in the DB still have old paths. The renamed path scenario doesn't trigger for them. → Mitigation: The `workDir` field is stored per-workspace and only computed once. Old records keep their old paths. This is backwards compatible.
- [Path length] UUID paths are longer. On Windows, MAX_PATH (260 chars) could be an issue for deeply nested projects. → Mitigation: Node.js on modern Windows supports long paths via `\\?\` prefix. Most users won't hit this. Document if it becomes a problem.
