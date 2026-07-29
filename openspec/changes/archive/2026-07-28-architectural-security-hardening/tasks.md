## 1. Encryption Infrastructure

- [x] 1.1 Add `ENCRYPTION_KEY` validation to `environment.validation.ts` (32-byte hex string)
- [x] 1.2 Create `src/common/utils/encryption.ts` with `encrypt()` and `decrypt()` using AES-256-GCM
- [x] 1.3 Add Prisma middleware in `src/database/prisma.module.ts` that encrypts `gitToken` and `apiKey` on write and decrypts on read for the `Workspace` model
- [x] 1.4 Write unit tests for encryption utility (encrypt then decrypt roundtrip, tamper detection)

## 2. Secure Credential Injection

- [x] 2.1 Add `writeCredentialsFile()` and `removeCredentialsFile()` methods to `DockerWorkspaceService` that create/remove temp files inside the container via stdin
- [x] 2.2 Add `writeGitAskpassScript()` method to `DockerWorkspaceService` that writes the GIT_ASKPASS script inside the container
- [x] 2.3 Rename `buildProviderEnv()` to `buildCredentialsFile()` — return credentials file content string instead of env var record
- [x] 2.4 Update `buildGitShCommand()` in `GitCommandsService` to use GIT_ASKPASS + temp file instead of shell-injection-prone `sh -c` pattern — remove `buildGitShCommand()`, replace with `GitAuthEnv` interface and callers prepare credential files via `DockerWorkspaceService`
- [x] 2.5 Update `execInContainer()` in both `DockerWorkspaceService` and `GitCommandsService` to accept a credentials file path and auto-cleanup after exec
- [x] 2.6 Update `SessionService` PTY spawn to write credentials file before spawning opencode and remove after session exits
- [x] 2.7 Remove `GIT_USERNAME` and `GIT_TOKEN` from `buildProviderEnv()` / `dockerExecArgs` — only `CREDENTIALS_FILE` is passed as env var

## 3. CORS Hardening

- [x] 3.1 Change `origin: true` to origin based on `MINI_APP_URL` / `WEBHOOK_DOMAIN` in `main.ts`
- [x] 3.2 Add fallback: if no URL is configured, use `false` (no CORS)

## 4. Provider Token Persistence (Bot + Mini App)

- [x] 4.1 Update `/git credential-status` Telegram handler to display provider name and token status (configured/masked/not configured)
- [x] 4.2 Add provider API key field to the git credential form in Mini App workspace settings (`app.js` renderWorkspaceSettings)
- [x] 4.3 Add `saveProviderApiKey()` to Mini App (`app.js`) that calls `PATCH /workspaces/:id` with the new apiKey
- [x] 4.4 Ensure provider token is included in the credentials file on every container ensure by reading `apiKey` from DB in `ensureContainer()` flow
- [x] 4.5 Update `DockerWorkspaceService.buildCredentialsFile()` to always include `*_API_KEY` entries when `providerId` and `apiKey` are present

## 5. WorkspaceService Refactor

- [x] 5.1 Create `src/modules/workspace/workspace-crud.service.ts` — extract workspace CRUD
- [x] 5.2 Create `src/modules/workspace/project.service.ts` — extract project operations
- [x] 5.3 Create `src/modules/workspace/workspace-git-sync.service.ts` — extract git sync logic
- [x] 5.4 Create `src/modules/workspace/dependency-install.service.ts` — extract dependency installation
- [x] 5.5 Update `workspace.module.ts` — register all new services and the facade
- [x] 5.6 Keep `WorkspaceService` as a thin facade that delegates to the new services with identical public method signatures
- [x] 5.7 Update all imports in controllers and handlers that use `WorkspaceService` — no code changes needed (facade preserves method signatures)

## 6. Dual-Interface Parity Verification

- [x] 6.1 Telegram Bot `/git credential-status` shows provider token status
- [x] 6.2 Mini App workspace settings shows provider token status with update capability
- [x] 6.3 `docker exec` no longer passes individual `-e GIT_TOKEN=xxx` flags (only `-e CREDENTIALS_FILE=/tmp/...`)
- [x] 6.4 `docker inspect <container>` does not expose credentials in env vars (credentials are temp files, not env)
- [x] 6.5 Git push/pull/clone works via `GIT_ASKPASS` in both bot and Mini App (code paths updated)
- [x] 6.6 Run full test suite: `npx jest` — 31/31 pass
- [x] 6.7 Run type check: `npx tsc --noEmit` — clean
