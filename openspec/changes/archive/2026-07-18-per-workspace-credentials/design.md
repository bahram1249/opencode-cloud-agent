## Context

The current codebase stores provider API keys ephemerally (passed at workspace creation but never persisted) and GitHub tokens globally on the `Tenant` model. The `DockerWorkspaceService.buildProviderEnv()` reads from `.env` for the provider key and from `Tenant.githubToken` for git auth — both shared across all workspaces. Projects use absolute host paths (`gitPath`) which leak infrastructure details into the bot UI and break when paths change. There is no automated dependency setup after cloning.

This design covers credential isolation, relative project paths, and automated project bootstrapping.

## Goals / Non-Goals

**Goals:**
- Store `apiKey`, `githubToken`, `githubLogin` on the `Workspace` model, scoped to that workspace only
- `DockerWorkspaceService` injects container env vars from the workspace record, not `.env` or `Tenant`
- GitHub OAuth flow scoped to a specific workspace (workspace ID embedded in OAuth state)
- `WorkspaceProject.gitPath` renamed to `path`, stored as workspace-relative string (`.` or `frontend`)
- Clone target determined by `path`, not remote repo name
- Auto-detect project type after clone/pull and run dependency installer
- Branch management (list, switch with dirty-state options stash/commit/abort)
- PR creation via `gh` CLI inside container
- Data migration for existing records

**Non-Goals:**
- Multi-container orchestrator (Kubernetes, swarm) — single-host Docker remains
- Credential rotation or expiry management
- Cross-workspace credential sharing (if needed, handled externally)
- Dependency lockfile validation or audit

## Decisions

**1. Store credentials on Workspace vs. a separate Credentials model**
- *Chosen*: Add columns directly to `Workspace`. Simpler queries, fewer joins, cascade deletes are free. A separate model would add complexity without clear benefit since credentials are 1:1 with workspaces.
- *Rejected*: Separate `WorkspaceCredential` table — over-engineering for key-value pairs. If credential types expand significantly, refactor later.

**2. Relative path model for projects**
- `path` field stores a relative string. `.` means `/workspace` root. `frontend` means `/workspace/frontend`.
- Clone command: `git clone <remoteUrl> <workspaceDir>/<path>`
- On read, the service resolves the full container path by joining `/workspace` with `path`.
- Migration: For existing records, strip the workspace `workDir` prefix from `gitPath` to derive the relative `path`.

**3. Dependency auto-install mechanism**
- After clone or pull, probe for known files in the project root:
  - `package.json` → `npm install` (user can configure `--force` or `--legacy-peer-deps` per project)
  - `requirements.txt` → `pip install -r requirements.txt`
  - `pyproject.toml` → `pip install -e .`
  - `Cargo.toml` → `cargo build`
  - `go.mod` → `go mod download`
  - `Gemfile` → `bundle install`
  - `composer.json` → `composer install`
- First match wins. Configurable per project (opt-out, override command).
- Runs inside the container via `docker exec -w <projectPath>`.

**4. Branch management dirty-state UX**
- On `/project switch <name> <branch>`:
  - If clean → checkout
  - If dirty → present inline keyboard: `[Stash]` `[Commit]` `[Abort]`
  - Stash: `git stash push -m "auto-stash before branch switch"`
  - Commit: prompt for commit message via bot, then `git commit -am "<msg>"`
  - Abort: cancel the operation

**5. PR creation via `gh` CLI**
- `gh` CLI is pre-installed in the workspace container image.
- `/git pr <project>` runs `gh pr create` inside the container at the project path.
- `gh` is already authenticated because the container has `GITHUB_TOKEN` set from the workspace record (via `gh auth setup-git` or automatic token detection).
- This avoids reimplementing the GitHub API PR endpoint.

**6. GitHub OAuth per workspace**
- OAuth state payload extended to include `workspaceId` alongside `telegramUserId` and `chatId`.
- On callback, token stored on `Workspace` record instead of `Tenant`.
- `DockerWorkspaceService.ensureContainer()` reads `githubToken` and `githubLogin` from the workspace record, with fallback to `Tenant` for backward compatibility during migration.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Existing users lose GitHub access after migration | Migration copies `Tenant.githubToken` to each of their workspaces |
| `npm install` can fail on unknown project structures | Fail gracefully, report error, don't block the clone. User can retry manually via `/project install <name>`. |
| `gh` CLI requires `GITHUB_TOKEN` env var — if missing, PR command fails | Validate token presence before offering PR option; report clear error |
| OAuth state with `workspaceId` makes the state store key more complex | State already includes compound data; adding one field is manageable |
| Relative path migration for existing projects whose `gitPath` doesn't cleanly map | Use heuristic: if `gitPath` starts with `workDir`, strip prefix. Otherwise, use `.` (workspace root). Log warning for manual review. |

## Migration Plan

1. **Schema migration**: Add `apiKey`, `githubToken`, `githubLogin` to `Workspace`. Add `path` column to `WorkspaceProject`. Keep `gitPath` during migration for rollback.
2. **Data migration script**: For each workspace, copy `Tenant.githubToken`/`Tenant.githubLogin` to the workspace record. Convert `WorkspaceProject.gitPath` to relative `path` by stripping the workspace `workDir` prefix.
3. **Code changes**: Refactor `WorkspaceService`, `DockerWorkspaceService`, `GitHubAuthService`, `TelegramCommandHandler` in dependency order.
4. **Drop old columns**: After verifying correctness, remove `WorkspaceProject.gitPath` via a second migration.
5. **Rollback**: Keep `gitPath` column and Tenant-level fallback code for one release cycle.

## Open Questions

- Should dependency install be opt-in per project (a flag `autoInstall: true/false`) or always on by default?
- What npm install variant should be the default: `npm install` or `npm ci`? User mentioned `--force` — should this be a project-level config?
- For `gh pr create`, should the bot support interactive PR body/description input, or just open PR from current branch with auto-generated title?
