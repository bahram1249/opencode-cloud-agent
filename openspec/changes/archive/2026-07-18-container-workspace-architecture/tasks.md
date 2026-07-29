## 1. Data Model & Config

- [x] 1.1 Add `githubLogin` and `githubAvatar` fields to Tenant Prisma schema and generate migration
- [x] 1.2 Update environment validation config to require Docker socket path; add `workspaceRoot` default path

## 2. GitHub Authentication

- [x] 2.1 Create GitHub OAuth module with auth URL generation, callback handler, and token exchange
- [x] 2.2 Add Telegram command handlers: `/login github`, `/logout github`
- [x] 2.3 On successful OAuth callback: store `githubToken`, `githubLogin` on Tenant; notify user
- [x] 2.4 On logout or 401/403 git failure: clear `githubToken` on Tenant; notify user to re-auth
- [x] 2.5 Validate token scopes on login and warn if `repo` scope is missing

## 3. Container Workspace Service Enhancements

- [x] 3.1 Inject `GITHUB_TOKEN` and `GITHUB_USER` env vars into container on `ensureContainer()`
- [x] 3.2 After container start, run `git config --global credential.helper` via `docker exec` to configure env-based auth
- [x] 3.3 Add `ensureContainer()` call to workspace `update()` flow for re-injecting env vars on model/token changes

## 4. Git Commands Service — Container-Aware Execution

- [x] 4.1 Add optional `containerId` parameter to all `GitCommandsService` methods
- [x] 4.2 When `containerId` is provided, execute git commands via `docker exec` instead of `execFile` on host
- [x] 4.3 Add container path conversion (host path → `/workspace` relative) via `DockerWorkspaceService.toContainerPath()`
- [x] 4.4 Ensure `validateRepo()` works inside container (check `/workspace/project/.git` existence)

## 5. Workspace Service — Auto Path & DTO Changes

- [x] 5.1 Auto-assign host path in `WorkspaceService.create()` as `{workspaceRoot}/{tenantId}/{sanitized name}`
- [x] 5.2 Remove `workDir` from `CreateWorkspaceDto`; update controller and tests
- [x] 5.3 Update `WorkspaceService.update()` to handle path rename (clean up old host dir, restart container)
- [x] 5.4 Update `addProject()` to clone inside container via `GitCommandsService` with `containerId`
- [x] 5.5 Update `syncProjects()` to run git operations inside container via `GitCommandsService` with `containerId`
- [x] 5.6 Update `configureProvider()` and `setDefaultModel()` to pass `tenant.githubToken` into container env

## 6. Session Service — Always Container

- [x] 6.1 Remove host-directory fallback in `SessionService.createSession()` — always ensure container
- [x] 6.2 Ensure container is running before spawning PTY; fail with clear error if container cannot start
- [x] 6.3 Update `sendToSession()` follow-up PTY spawn to always use `docker exec`

## 7. Project Sync — Pull on Container Start

- [x] 7.1 Call `syncProjects()` from `ensureContainer()` after container start (not just session create)
- [x] 7.2 Add Telegram command `/ws <name> sync` for explicit manual sync
- [x] 7.3 Report sync results (clone/pull/skip/error per project) back to user

## 8. Docker & Deployment Config

- [x] 8.1 Add Docker socket volume mount to `docker-compose.yml` for the app container
- [x] 8.2 Verify `opencode-workspace.Dockerfile` has `git` and `bash` installed
- [x] 8.3 Update `.env.example` with new config vars (`WORKSPACE_ROOT`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`)

## 9. Migration for Existing Workspaces

- [x] 9.1 Write migration script that creates containers for all existing workspaces without one
- [x] 9.2 Script updates `workDir` on existing workspaces to auto-assigned path pattern
- [x] 9.3 Script injects `GITHUB_TOKEN`/`GITHUB_USER` from tenant into new container env

## 10. Testing

- [x] 10.1 Unit tests for `DockerWorkspaceService` env injection and git config
- [x] 10.2 Unit tests for `GitCommandsService` container-aware execution
- [x] 10.3 Unit tests for `WorkspaceService` auto path assignment
- [ ] 10.4 Integration tests: create workspace → container exists → add project → clone inside container
- [ ] 10.5 Integration tests: GitHub auth flow (mock OAuth)
- [ ] 10.6 Integration tests: sync on container start pulls projects
