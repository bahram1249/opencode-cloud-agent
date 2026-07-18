## 1. Schema & Migration

- [x] 1.1 Add `apiKey`, `githubToken`, `githubLogin` columns to `Workspace` model in Prisma schema
- [x] 1.2 Rename `WorkspaceProject.gitPath` to `path` (keep old column temporarily for rollback)
- [x] 1.3 Add `autoInstall` (boolean, default true) and `installCommand` (string?, optional) to `WorkspaceProject`
- [x] 1.4 Run `prisma migrate dev` to generate migration
- [x] 1.5 Write data migration: copy `Tenant.githubToken`/`Tenant.githubLogin` to each workspace for that tenant
- [x] 1.6 Write data migration: convert existing `WorkspaceProject.gitPath` to relative `path` by stripping workspace `workDir` prefix

## 2. Per-Workspace Credential Storage

- [x] 2.1 Refactor `WorkspaceService.create()` to accept and store `apiKey` on the workspace record
- [x] 2.2 Refactor `WorkspaceService.update()` and `configureProvider()` to handle `apiKey` updates
- [x] 2.3 Update `CreateWorkspaceDto` and `UpdateWorkspaceDto` to include `apiKey`
- [x] 2.4 Refactor `DockerWorkspaceService.buildProviderEnv()` to read API key from workspace record, not `.env`
- [x] 2.5 Refactor `DockerWorkspaceService.ensureContainer()` to accept `WorkspaceContainerSpec` with workspace-level credentials
- [x] 2.6 Add Tenant-level fallback: if workspace has no `githubToken`, use `Tenant.githubToken`

## 3. Per-Workspace GitHub OAuth

- [x] 3.1 Extend OAuth state to include `workspaceId` alongside `telegramUserId` and `chatId`
- [x] 3.2 Refactor `GitHubAuthService.generateAuthUrl()` to accept optional `workspaceId` and embed it in state
- [x] 3.3 Refactor `GitHubAuthService.handleCallback()` to store token on workspace when `workspaceId` is present
- [x] 3.4 Add handler for `/workspace github-login <name>` in `TelegramCommandHandler`
- [x] 3.5 Update `DockerWorkspaceService.ensureContainer()` to read `githubToken`/`githubLogin` from workspace record

## 4. Relative Project Paths

- [x] 4.1 Refactor `WorkspaceService.addProject()` to store `path` as workspace-relative string
- [x] 4.2 Update `CreateProjectDto` and `UpdateProjectDto`: replace `gitPath` with `path`
- [x] 4.3 Refactor clone logic: `git clone <remoteUrl> <workspaceDir>/<path>` (`.` = workspace root)
- [x] 4.4 Refactor `DockerWorkspaceService.toContainerPath()` to resolve relative paths
- [x] 4.5 Update Telegram command handler display to show relative paths instead of absolute

## 5. Branch Management

- [x] 5.1 Implement `/project branches <name>` command — list local and remote branches with current branch indicator
- [x] 5.2 Implement `/project switch <name> <branch>` command — checkout branch if clean
- [x] 5.3 Add dirty-state detection and inline keyboard: [Stash] [Commit] [Abort]
- [x] 5.4 Implement stash handler: `git stash push -m "auto-stash before branch switch"` then checkout
- [x] 5.5 Implement commit handler: prompt for message, `git commit -am "<msg>"`, then checkout
- [x] 5.6 Implement abort handler: cancel with no side effects

## 6. Pull Request Creation

- [x] 6.1 Add `gh` CLI to the workspace Docker image (`Dockerfile`)
- [x] 6.2 Implement `/git pr <name>` command — runs `gh pr create --fill` inside container at project path
- [x] 6.3 Add validation: require `githubToken` on workspace before allowing PR creation
- [x] 6.4 Return PR URL to user on success, error message on failure

## 7. Automatic Dependency Installation

- [x] 7.1 Implement project type detection logic in `WorkspaceService` or new helper service
- [x] 7.2 Implement installer execution (run detected command inside container via `docker exec`)
- [x] 7.3 Integrate auto-install into `addProject()` after clone
- [x] 7.4 Integrate auto-install into `syncProjects()` after clone/pull
- [x] 7.5 Implement `/project install <name>` command for manual re-install
- [x] 7.6 Add project-level config: respect `autoInstall` flag and `installCommand` override

## 8. Verification & Cleanup

- [x] 8.1 Run full test suite and fix any regressions
- [ ] 8.2 Run `prisma migrate dev` to drop old `gitPath` column after verifying migration
- [ ] 8.3 Verify bot UX for all new flows: credential setup, project creation, branch management, PR, dep install
- [ ] 8.4 Update container image documentation with new dependency (gh CLI)
