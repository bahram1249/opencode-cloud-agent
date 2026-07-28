## Context

The codebase orchestrates AI coding sessions inside Docker containers with dual Telegram Bot + Mini App interfaces. Currently, API keys and git tokens are stored in plaintext in SQLite, injected into containers via `docker exec -e VARIABLE=value`, and git authentication uses a shell-injectable credential helper pattern (`sh -c "git config ..."`). The WorkspaceService has grown to 463 lines with 7+ responsibilities. The previous architectural review scored the project 6/10 with secrets management as the critical blocker.

## Goals / Non-Goals

**Goals:**
- Encrypt gitToken and apiKey at rest using AES-256-GCM via Prisma middleware — transparent to all existing callers
- Replace docker exec env-var credential injection with secure temp-file-based delivery
- Replace `buildGitShCommand()` shell-injection-prone credential helper with GIT_ASKPASS script
- Persist API provider tokens so they auto-inject on every container ensure/exec — user never re-configures
- Split WorkspaceService into focused services with clean boundaries
- Restrict CORS to configured Mini App URL
- Every change lands in both Telegram Bot and Mini App interfaces

**Non-Goals:**
- Migrating away from SQLite (that's a separate infra decision)
- Adding SSH key support (out of scope — HTTPS PAT remains the only git auth method)
- Full test coverage (existing tests preserved; new tests only for new services)
- BullMQ/Redis integration (unused dependencies, removal is separate cleanup)
- Session persistence across restarts (in-memory design stays for now)

## Decisions

### 1. Prisma Middleware for Encryption (vs application-layer encryption service)

**Decision**: Use Prisma middleware on `findUnique`, `findFirst`, `findMany`, `create`, and `update` operations for the `Workspace` model to automatically encrypt/decrypt `gitToken` and `apiKey` fields.

**Rationale**: Prisma middleware is the most transparent approach — zero changes to service code that reads/writes these fields. The middleware runs in-process, so there's no network hop. AES-256-GCM provides authenticated encryption (integrity + confidentiality). The encryption key comes from `ENCRYPTION_KEY` env var (32 bytes, hex-encoded), separate from the bot token.

**Alternatives considered:**
- Application-layer service (`EncryptionService`) — would require touching every read/write site, more invasive
- SQLite encryption extension (`sqlcipher`) — requires rebuilding SQLite, not portable
- Vault/Secrets Manager — adds infra dependency, overkill for single-node deployment

### 2. Temp-File Credential Injection (vs docker secrets or env vars)

**Decision**: Write credentials to a temporary file inside the container via `docker exec -i sh -c "cat > /tmp/creds-xxx"`, set restrictive permissions (0o600), pass the file path via env var (`CREDENTIALS_FILE=/tmp/creds-xxx`), and delete the file after use.

**Rationale**: Docker secrets require Swarm mode; bind-mounting a host file requires the host path to exist on the Docker host. Temp files via stdin are portable across Docker backends (dockerode + CLI), don't leak into `docker inspect`, and are cleaned up after use.

**Credential file format:**
```
GIT_TOKEN=ghp_xxx
GIT_USERNAME=myuser
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

The `buildProviderEnv()` method will be renamed to `buildCredentialsFile()` and return the file content + path instead of env vars.

### 3. GIT_ASKPASS Script (vs credential helper shell function)

**Decision**: Write a small shell script to `/tmp/git-askpass.sh` inside the container that reads credentials from the creds file and `echo`s username/password when git prompts. Set `GIT_ASKPASS=/tmp/git-askpass.sh` in the environment.

**Rationale**: The GIT_ASKPASS protocol is designed for exactly this — git spawns the script when it needs credentials, passing the prompt as the first argument. The script reads the creds file and outputs `username` on stdout for the username prompt and `password` for any other prompt. This completely eliminates the shell injection surface from `buildGitShCommand()`.

**Alternatives considered:**
- `git config --global credential.helper` with env vars — current broken approach
- `GIT_ASKPASS=true` — requires specific git version support, not portable
- Mounting `.git-credentials` file — requires file to pre-exist, not dynamic

### 4. WorkspaceService Decomposition

**Decision**: Split into 4 services:
- `WorkspaceCrudService` — create/read/update/delete workspaces, tenant management
- `ProjectService` — project CRUD, project queries, project path resolution
- `WorkspaceGitSyncService` — clone, pull, validate repos, sync projects
- `DependencyInstallService` — project type detection, install command execution

**Rationale**: Each service has a single responsibility, making them testable. The original god service's 463 lines are distributed across focused modules. Backward compatibility is maintained by keeping the public method signatures the same in a thin `WorkspaceService` facade that delegates to the new services, then migrating callers one by one.

### 5. Provider Token Persistence Flow

Every time a container is ensured or a docker exec session is started:
1. Read encrypted credentials from DB (middleware auto-decrypts)
2. Write credentials file inside container (temp file via stdin)
3. Pass `CREDENTIALS_FILE=/tmp/creds-xxx` as the only env var
4. OpenCode startup script sources the creds file
5. On session end, remove the temp file

The bot and Mini App get a new "Provider Token" section in the credentials management UI where users can view status (configured/not configured) and update their provider API key without needing to restart the container.

## Risks / Trade-offs

- **Temp file persistence**: If the process crashes before cleanup, credential files remain in the container. Mitigation: Use container-scoped tmpfs (`/tmp` is ephemeral in many Docker configs) and set a 1-hour max lifetime.
- **Middleware performance**: AES-256-GCM decryption on every DB read adds ~1ms per operation. Mitigation: Only the `Workspace` model uses encryption — queries are infrequent (not per-request).
- **Service refactor risk**: Changing service boundaries while the system is in use can break existing callers. Mitigation: The facade pattern keeps existing imports working; callers migrate gradually.
- **Dual-interface scope**: Provider token UI is simple for both interfaces but the Mini App requires adding a new form section. Mitigation: The token form reuses the exact same pattern as git credentials.
