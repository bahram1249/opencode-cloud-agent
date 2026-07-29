## Why

The opencode-orchestrator manages remote workspaces for Telegram users, but currently treats workspaces as host-directory-based environments with optional Docker containers bolted on. This creates path confusion (user-provided workDir vs container /workspace), missing git authentication plumbing, and no automatic project sync on container start. As we scale toward an enterprise cloud-agent platform, every workspace must be truly container-isolated with automatic GitHub-authenticated git operations and a fixed `/workspace` path contract.

## What Changes

- **Container-first workspace model** — every workspace gets a dedicated Docker container; the `workDir` field becomes a system-assigned host path (not user-configurable); the container always uses `/workspace`
- **Git authentication via tenant GitHub token** — tenant's `githubToken` is injected into the container and used for all git operations (clone, pull, push, commit)
- **Automatic pull on container start** — all enabled projects are pulled when the container starts (or is ensured), not just at session creation
- **In-container git operations** — all git commands (clone, pull, commit, push, status, diff, log) run inside the container via `docker exec`, using the authenticated user's credentials
- **Tenant model extended** — add `githubLogin` and optionally `githubAvatar` fields to Tenant
- **Project gitPath scoped to /workspace/** — all project paths are relative to `/workspace` inside the container
- **BREAKING**: `CreateWorkspaceDto.workDir` removed (no longer user-configurable); host path is auto-assigned

## Capabilities

### New Capabilities
- `github-auth`: GitHub OAuth login flow, token storage, and credential management for tenants
- `container-workspace`: Container lifecycle management (create, start, stop, remove per workspace) with `/workspace` path contract
- `git-operations`: Authenticated git operations (clone, pull, push, commit, status, diff, log) running inside containers
- `project-sync`: Automatic project cloning on add and pulling on container start/git operations

### Modified Capabilities
*(No existing specs to modify — this is the first set of capabilities)*

## Impact

- **Docker dependency becomes required** (was optional); `workspaceContainersEnabled` config may be removed or default to true with no fallback
- **WorkspaceController**: `POST /workspaces` no longer accepts `workDir`; host path is auto-assigned
- **GitCommandsService**: all operations move to `docker exec`-based execution inside the container (or stay host-based but with token plumbing for non-container fallback)
- **SessionService**: session creation always ensures container; no host-directory fallback path
- **WorkspaceService.syncProjects()**: runs git clone/pull inside the container via docker exec
- **Tenant model**: Prisma migration needed for `githubLogin` field
- **Docker workspace image**: may need git credential helper pre-configured
- **docker-compose.yml**: may need Docker socket mapping for the app container to create sibling containers
