## Why

The codebase has critical security gaps and architectural debt that block production deployment. Git tokens and API keys are stored in plaintext SQLite, exposed via docker exec environment variables, and vulnerable to shell injection through the credential helper. The 463-line WorkspaceService is a god service with 7+ responsibilities. Test coverage is below 5%. Without these fixes, credential exposure and operational fragility are guaranteed.

## What Changes

1. **Encrypt secrets at rest** — Prisma middleware that encrypts `gitToken` and `apiKey` on write, decrypts on read using AES-256-GCM with a key from environment
2. **Remove secrets from docker exec env vars** — Inject credentials as mounted files or temporary files inside the container instead of `-e GIT_TOKEN=xxx`. The `buildProviderEnv()` method will write to a temp file and pass the path.
3. **Fix credential helper shell injection** — Replace the `sh -c` shell string pattern in `buildGitShCommand()` with a `GIT_ASKPASS` script approach that isolates credential output from command execution
4. **Refactor WorkspaceService** — Split into focused services: `WorkspaceCrudService`, `ProjectService`, `WorkspaceGitSyncService`, `DependencyInstallService`
5. **Fix CORS** — Restrict `origin: true` to the configured Mini App URL
6. **Persist API provider tokens in container** — API keys (opencode, anthropic, openai, etc.) stored encrypted and auto-injected on every container ensure/exec so the user never has to re-configure them
7. **Dual-interface parity** — Every change must land in both Telegram Bot handlers and Telegram Mini App UI

## Capabilities

### New Capabilities

- `secret-encryption`: Encrypt git tokens and API keys at rest using AES-256-GCM with Prisma middleware; decryption on read is transparent to callers
- `secure-credential-injection`: Replace docker exec env-var injection with temp-file-based credential delivery; implement GIT_ASKPASS script for git authentication
- `provider-token-persistence`: Auto-inject API provider keys into container on every ensure/exec so OpenCode always has the token without manual setup each time
- `workspace-service-refactor`: Decompose WorkspaceService into WorkspaceCrudService, ProjectService, WorkspaceGitSyncService, and DependencyInstallService

### Modified Capabilities

- `git-operations`: Credential injection path changes — bot and Mini App git flows transparently use new GIT_ASKPASS mechanism
- `session-management`: Session creation auto-injects provider tokens into the spawned opencode process

## Impact

- **Prisma schema**: No schema changes — encryption is transparent middleware
- **DockerWorkspaceService**: `buildProviderEnv()` signature changes; env-var injection replaced with file-based approach
- **GitCommandsService**: `buildGitShCommand()` replaced with GIT_ASKPASS method
- **WorkspaceService**: Refactored into 4 services — all existing consumers need updating
- **main.ts**: CORS config change
- **Telegram handlers**: Provider token UI for set/update/status in git credential section
- **Mini App app.js**: Provider token form section in workspace settings
- **.env.example**: Add `ENCRYPTION_KEY` variable
