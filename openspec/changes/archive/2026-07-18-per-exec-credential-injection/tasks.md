## 1. Environment plumbing in DockerWorkspaceService

- [x] 1.1 Add optional `env?: Record<string, string>` parameter to `execInContainer` — insert `-e KEY=val` entries before container ID in the docker exec args
- [x] 1.2 Add optional `env?: Record<string, string>` parameter to `dockerExecArgs` — same `-e` insertion logic
- [x] 1.3 Add optional `env?: Record<string, string>` parameter to `dockerExecNonInteractiveArgs` — same `-e` insertion logic
- [x] 1.4 Change `buildProviderEnv` return type from `string[]` (docker `--env KEY=val` format) to `Record<string, string>` for use as per-exec env map

## 2. Simplify container creation

- [x] 2.1 Remove `configureGitCredentials` call from both backend `ensureContainer` implementations (dockerode and CLI)
- [x] 2.2 Remove `env` parameter from backend `ensureContainer` methods — no credential env vars on `docker create`
- [x] 2.3 Remove `buildProviderEnv` call from `DockerWorkspaceService.ensureContainer` — credentials no longer baked into container
- [x] 2.4 Verify containers created after this change carry only volume mount, labels, and `sleep infinity` — no credential artifacts

## 3. Git credential injection in GitCommandsService

- [x] 3.1 Create private helper method `buildGitShCommand(gitCommand: string, args: string[], credentials: { username: string; token: string }): { command: string; args: string[]; env: Record<string, string> }` that wraps a git command in `sh -c` with inline credential helper
- [x] 3.2 Add `execInContainerWithGitCreds` wrapper method that reads workspace credentials, builds env, and calls `execInContainer` with the sh -c wrapped command
- [x] 3.3 Update `GitCommandsService.clone` to use git credentials when containerId is present
- [x] 3.4 Update `GitCommandsService.pull` to use git credentials when containerId is present
- [x] 3.5 Update `GitCommandsService.push` to use git credentials when containerId is present
- [x] 3.6 Update `GitCommandsService.fetch` (if exists) to use git credentials when containerId is present
- [x] 3.7 Do NOT change `status`, `diff`, `log`, `branch`, `checkout`, `commit`, `add`, `validateRepo` — local-only commands don't need credentials

## 4. OpenCode session credential injection

- [x] 4.1 In `SessionService.createSession`, build env map from workspace credentials and pass to `dockerExecArgs` via the new `env` parameter
- [x] 4.2 In `SessionService.sendToSession` follow-up PTY spawn, build env map from workspace credentials and pass to `dockerExecArgs` via the new `env` parameter

## 5. Update call sites in WorkspaceService

- [x] 5.1 In `WorkspaceService.create`, verify `ensureContainer` no longer needs the old `apiKey`/`gitToken`/`gitUsername` fields in the container spec
- [x] 5.2 In `WorkspaceService.listOpenCodeModels`, pass provider API key via `-e` on the docker exec for `opencode models`
- [x] 5.3 In `WorkspaceService.syncProjects`, ensure git operations within sync use credential injection (they go through GitCommandsService, should work after task 3)

## 6. Verification

- [x] 6.1 Run `npm run typecheck` — no type errors with new signatures
- [x] 6.2 Run `npm run test` — existing tests pass
- [x] 6.3 Run `npm run test:e2e` — e2e tests pass
- [x] 6.4 Manual: start a workspace, configure provider, start a session — verify OpenCode receives the API key
- [x] 6.5 Manual: change provider key via `/workspace provider` — verify next session uses the new key (no restart)
- [x] 6.6 Manual: configure git credentials via `/git login`, clone a repo — verify clone succeeds
- [x] 6.7 Manual: update git token via `/git login` — verify next git pull uses the new token (no restart)
