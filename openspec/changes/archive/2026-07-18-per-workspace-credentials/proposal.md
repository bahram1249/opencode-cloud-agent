## Why

Credentials (provider API keys, GitHub tokens) are currently sourced from global `.env` and the Tenant model — shared across all workspaces. This breaks isolation: a workspace for Project A should not have access to Project B's keys. Additionally, the project model stores absolute host paths (leaking infrastructure details) and has no automated dependency setup after cloning. We need a per-workspace credential model, a clean relative path system for projects, and automated project bootstrapping.

## What Changes

- **Schema**: Add `apiKey`, `githubToken`, `githubLogin` to `Workspace` model. Rename `WorkspaceProject.gitPath` to `path` and store relative paths.
- **Credential isolation**: `DockerWorkspaceService` reads credentials from the workspace record, not from `.env` or the Tenant model.
- **GitHub auth per workspace**: OAuth flow stores the resulting token on the workspace, with workspace ID embedded in OAuth state.
- **Relative project paths**: `path` field is relative to workspace root (`.` = `/workspace`, `frontend` = `/workspace/frontend`). Clone target determined by path, not remote name.
- **Auto dependency install**: After clone/pull, detect project type (`package.json`, `requirements.txt`, etc.) and run the appropriate installer inside the container.
- **Branch management**: List branches, switch branches (with dirty-state options: stash/commit/abort), track current branch.
- **PR creation**: Use `gh` CLI inside the container for PR workflow.
- **Data migration**: Existing `Tenant.githubToken`/`Tenant.githubLogin` values copied to each workspace for that tenant. Existing `WorkspaceProject.gitPath` values converted to relative paths (stripping the workspace root prefix).

## Capabilities

### New Capabilities

- `workspace-credentials`: Per-workspace storage of provider API keys, GitHub tokens, and GitHub login. Container env vars built from workspace record. OAuth flow scoped to a workspace.
- `project-lifecycle`: Project CRUD with relative path model, path-based git clone, branch management (list, switch with dirty-state handling), pull request creation via `gh` CLI, and automatic dependency installation on clone/pull.

### Modified Capabilities

*(None — no existing specs)*

## Impact

- **Schema**: Prisma migration — add columns to `Workspace`, rename `WorkspaceProject.gitPath` → `path`, change `path` column type to relative string.
- **WorkspaceService**: `create` no longer accepts `apiKey` as a separate param; provider config is part of workspace creation/update. `addProject` and `syncProjects` run dependency install after clone/pull.
- **DockerWorkspaceService**: `ensureContainer` reads credentials from workspace record. `buildProviderEnv` uses workspace-scoped values.
- **GitHubAuthService**: OAuth state includes `workspaceId`. Callback stores token on `Workspace` instead of `Tenant`.
- **TelegramCommandHandler**: New commands/flows for per-workspace GitHub login, project branch interaction, dirty-state resolution options.
- **Container image**: Must include `gh` CLI and common language runtimes (Node.js, Python) for dependency install.
