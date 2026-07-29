## Why

Currently, provider API keys and git credentials are baked into Docker containers at creation time via `--env` flags and `git config --global credential.helper`. This means credential changes (via `/workspace provider` or `/git login`) don't take effect until the container is restarted — and in practice, the existing container is never recreated with new env vars, so **changing credentials via the bot is broken for OpenCode sessions**. Credentials also persist inside the container indefinitely, which is unnecessary since every command runs through `docker exec`.

## What Changes

- Remove credential env vars from `docker create` — containers start with `sleep infinity` only
- Remove `configureGitCredentials` from container startup — no git config is persisted
- Add credential env injection to every `docker exec` call: `-e API_KEY=...` for OpenCode, `-e GIT_USERNAME=... -e GIT_TOKEN=...` for git
- Wrap git commands in `sh -c` to set up credential helper inline before the real git command
- Update `execInContainer` and `dockerExecArgs` to accept optional env overrides
- Simplify `ensureContainer`: it only needs to guarantee the container is running, not configured

## Capabilities

### New Capabilities
- `credential-injection`: Mechanism for injecting provider API keys and git credentials per `docker exec` invocation, supporting per-call env vars and inline git credential helper setup

### Modified Capabilities
- `container-workspace`: Container creation no longer injects credential env vars or runs git credential configuration. Container spec changes from `--env KEY=val` plus volume to just volume + labels.
- `workspace-credentials`: Changes from "container receives API key as env var at startup" to "OpenCode session receives API key as env var per docker exec"
- `git-credential-management`: Changes from "GIT_TOKEN and GIT_USERNAME set in container environment" to "GIT_TOKEN and GIT_USERNAME passed as env vars per docker exec; credential helper configured inline via sh -c"

## Impact

- **DockerWorkspaceService**: `buildProviderEnv` will no longer be used at container create. `configureGitCredentials` removed from startup flow. `execInContainer`/`dockerExecArgs` gain optional `env` parameter. `ensureContainer` simplified.
- **GitCommandsService**: Every git operation needs credential env wiring and `sh -c` wrapper for credential helper. Credentials passed per-call instead of relying on container state.
- **SessionService**: `createSession` and `sendToSession` need to pass `-e API_KEY=...` on the docker exec for OpenCode.
- **WorkspaceService**: `create`, `update`, `configureProvider`, `setDefaultModel`, `getWorkspaceCredentials` — the credential retrieval is unchanged (still reads from DB), but the credential delivery path changes from container env to exec-time injection.
- **No dependency changes**: No new packages. No Prisma schema changes. Credential storage model stays identical.
