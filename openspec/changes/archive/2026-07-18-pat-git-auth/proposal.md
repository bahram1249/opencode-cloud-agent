## Why

The current authentication system is tied exclusively to GitHub OAuth — requiring a registered OAuth app, a public webhook domain, and in-memory state management with 10-minute expiry. This is fragile for a Telegram bot and excludes users of GitLab, Bitbucket, self-hosted providers, or anyone who prefers a Personal Access Token. The UX has no loading indicators, no scope validation, no example-driven guidance, and no auto-detection of expired tokens during git operations.

We need a provider-agnostic git credential system that works with any git-over-HTTPS provider, validates via `git ls-remote`, and guides users through every state with clear examples.

## What Changes

- **BREAKING**: Remove GitHub OAuth entirely — delete `GitHubAuthController`, OAuth methods in `GitHubAuthService`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` config, in-memory `stateStore`, and the HTTP callback endpoint
- **BREAKING**: Rename `Workspace.githubToken` → `Workspace.gitToken` and `Workspace.githubLogin` → `Workspace.gitUsername` in Prisma schema
- **BREAKING**: Rename `GitHubAuthService` → `GitAuthService`, `GitHubAuthModule` → `GitAuthModule`
- **BREAKING**: Rename container env vars `GITHUB_TOKEN` → `GIT_TOKEN` and `GITHUB_USER` → `GIT_USERNAME` (with backward-compat aliases)
- **NEW**: Credential validation via `git ls-remote` instead of GitHub API — works with any provider
- **NEW**: Six UX states: Empty, Loading, Success, Error, Expired, Status — each with built-in examples
- **NEW**: `/git login`, `/git logout`, `/git status`, `/git test` commands replacing `/login github` and `/logout`
- **NEW**: Auto-detect expired/revoked tokens on git failure — clear + notify + show re-login example
- **MODIFIED**: Setup wizard step 4 — no OAuth fork, always PAT + optional remote URL
- **REMOVED**: `Tenant.githubToken`, `Tenant.githubLogin`, `Tenant.githubAvatar` — credentials are per-workspace only

## Capabilities

### New Capabilities
- `git-credential-management`: Provider-agnostic git credential management — set, validate, test, remove credentials via PAT with full UX state handling

### Modified Capabilities
- `workspace-credentials`: Remove GitHub OAuth requirements; rename to generic git credentials; update credential storage, revocation, and scope validation to be provider-agnostic
- `container-workspace`: Rename env vars `GITHUB_TOKEN`→`GIT_TOKEN`, `GITHUB_USER`→`GIT_USERNAME`; update credential helper configuration
- `git-operations`: Reference generic git credentials instead of GitHub-specific names
- `project-lifecycle`: Update GitHub auth checks and `gh` CLI references to use generic git credentials

## Impact

- **Database**: Prisma migration renaming columns on `Workspace` and `Tenant`; `Tenant.githubAvatar` dropped
- **Backend**: Delete `GitHubAuthController`; rename service/module; new validation logic using `git ls-remote`
- **Telegram bot**: Remove `/login`/`/logout` commands; add `/git login/logout/status/test`; update help text and setup wizard
- **Docker**: Rename env vars injected into containers; update git credential helper script
- **Config**: Remove `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` from `app.config.ts` and `environment.validation.ts`
- **`.env.example`**: Remove OAuth comments; document new generic git credential flow
