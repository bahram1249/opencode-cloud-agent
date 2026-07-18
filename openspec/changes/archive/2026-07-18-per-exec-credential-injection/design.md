## Context

Every command runs through `docker exec` — OpenCode sessions, git operations, model discovery, dependency installation. Despite this, credentials are currently baked into the container at `docker create` time via `--env` flags and `git config --global credential.helper`. This means:

- Changing a provider API key or git token requires a container restart
- `ensureContainer` is called on every session start but never recreates the container, so new credentials silently don't apply to OpenCode sessions (latent bug)
- Credentials persist inside the container for the container's lifetime

The fix: stop baking credentials into the container. Pass them per `docker exec` via `-e` flags.

## Goals / Non-Goals

**Goals:**
- Credential changes take effect immediately without container restart
- No credentials are persisted inside the container's env or git config
- All existing functionality (OpenCode sessions, git clone/pull/push/status/log/branch, model discovery, dependency install) continues to work
- DB model for credential storage remains unchanged

**Non-Goals:**
- No multi-tenant container sharing (each workspace still has its own container)
- No new API endpoints or Telegram commands
- No credential rotation or expiry management beyond existing behavior

## Decisions

### 1. `execInContainer` signature — add optional `env` parameter

**Decision:** `execInContainer(containerId, cwd, command, args, env?)` — `env` is `Record<string, string> | undefined`. When present, each key=value becomes `-e` before the command in the docker exec.

**Alternatives considered:**
- Wrapper function (e.g., `execInContainerWithCreds`) — more call sites, harder to maintain
- Class-level credential cache — couples exec to workspace state, adds complexity
- `env` param on every call is explicit and testable

### 2. Docker exec args helpers — same `env` pattern

**Decision:** `dockerExecArgs` and `dockerExecNonInteractiveArgs` gain `env?: Record<string, string>` parameter. They insert `-e KEY=val` entries into the returned args array before the container ID:

```
['exec', '-i', '-t', '-e', 'GIT_USERNAME=u', '-e', 'GIT_TOKEN=t', '-w', '/workspace', containerId, command, ...args]
```

### 3. Git commands — `sh -c` wrapper pattern

**Decision:** Every git command in `GitCommandsService` that runs inside a container wraps the real git command in `sh -c` that sets up the credential helper:

```
sh -c 'git config --global credential.helper "!f() { echo username=$GIT_USERNAME; echo password=$GIT_TOKEN; }; f" && git pull'
```

The credential helper reads from `GIT_USERNAME` and `GIT_TOKEN` env vars passed via `docker exec -e`.

**Why `sh -c` over alternatives:**
- `git -c credential.helper=...` works but is verbose and tricky with escaping
- Pre-set `GIT_ASKPASS` script — requires writing a script file per exec
- URL-embedded tokens (`https://user:token@host/repo`) leak in process listings
- `sh -c` is simple, portable, and the env vars disappear when the exec finishes

### 4. `buildProviderEnv` — repurposed, not removed

**Decision:** `buildProviderEnv` (currently used only at container create) becomes the env builder for per-exec injection. Same `Record<string, string>` output, but consumed by callers of `dockerExecArgs`/`execInContainer` instead of by `ensureContainer`.

The method itself doesn't change — just its call site.

### 5. `configureGitCredentials` — removed from startup

**Decision:** Removed from `ensureContainer` and both backend `ensureContainer` implementations. No git config is written at container creation time. Git credentials are injected per-exec via the `sh -c` wrapper in `GitCommandsService`.

### 6. `ensureContainer` — simplified

**Decision:** `ensureContainer` no longer calls `configureGitCredentials`. The `env` parameter to the backend is removed (backends no longer receive env arrays). Container creation becomes: volume mount + labels + `sleep infinity`. That's it.

## Risks / Trade-offs

- **[Exec overhead]** Every git command now includes a `sh -c` wrapper + credential helper setup — adds ~50ms per call. Acceptable since git ops are already network-bound.
- **[Escaping edge cases]** Git credentials with special chars (`$`, `"`, `\`) could break the `sh -c` inline helper. Mitigation: single-quote the values in the credential helper, which prevents shell interpolation. Only single quotes in the value itself would need escaping (replace `'` with `'\''`).
- **[GitCommandsService scope]** `GitCommandsService` has methods for clone, pull, push, status, diff, log, branch, checkout, commit, add, validateRepo — about 11 methods that would need the `sh -c` wrapper. Some (like `status`, `validateRepo`) may not need credentials. Should be selective — only wrap commands that interact with remotes.
- **[GitAuthService validation]** `git ls-remote` currently uses URL-embedded tokens (`https://user:token@host`). This validation path is separate from regular git operations and doesn't use `GitCommandsService` — it embeds the token directly in the URL and runs via `execInContainer`. This is fine and doesn't need the `sh -c` pattern.
- **[Regression surface]** Every git operation path is affected. Mitigation: all git commands have test coverage in `test/`. Run full test suite after changes.
