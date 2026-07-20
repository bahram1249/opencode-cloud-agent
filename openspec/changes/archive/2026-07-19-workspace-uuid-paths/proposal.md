## Why

Workspace creation fails on macOS because `WORKSPACE_ROOT` defaults to `/workspace` — a Unix path that doesn't exist or requires root on macOS. On Windows it works accidentally (drive-relative path resolution). The path also uses `{tenantId}/{name}` which breaks on rename and exposes internal IDs. We need a cross-platform, stable, rename-safe path for every workspace.

## What Changes

- Default `WORKSPACE_ROOT` changes from `/workspace` to a platform-appropriate path outside the project directory
- Workspace path structure changes from `{root}/{tenantId}/{name}` to `{root}/{tenantId}/{workspaceId}`
- Workspace ID is pre-generated (UUID) before DB insert and used as the path segment
- The `create()` method ensures the root directory exists before creating workspace subdirectories
- Docker volume mount continues to use `workDir:/workspace` — no change to the container contract

## Capabilities

### New Capabilities

- `cross-platform-paths`: Platform-adaptive workspace root directory with UUID-based paths that work on macOS, Linux, and Windows without configuration

### Modified Capabilities

- `container-workspace`: The "Auto-assign host path" scenario changes from `{workspaceRoot}/{tenantId}/{workspaceName}` to `{workspaceRoot}/{tenantId}/{workspaceId}`

## Impact

- `src/modules/workspace/workspace.service.ts` — `create()` method: path resolution logic, pre-generate workspace ID
- `src/config/app.config.ts` — default `workspaceRoot` value
- `src/modules/workspace/docker-workspace.service.ts` — `createContainerWithDockerode()` and `createContainerWithCli()` mount `workDir` (unchanged behavior, same field)
- `src/modules/workspace/dto/workspace.dto.ts` — no changes expected
- `prisma/schema.prisma` — no schema changes needed (workDir field already exists, id field is overridable)
- `docker-compose.yml` — no changes needed (WORKSPACE_ROOT env var overrides default)
- `docker/opencode-workspace.Dockerfile` — no changes
