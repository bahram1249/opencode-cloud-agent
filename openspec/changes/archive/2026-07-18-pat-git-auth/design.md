## Context

The system currently has two parallel auth paths: GitHub OAuth (primary) and PAT (fallback). Both are GitHub-specific, stored in `GitHubAuthService` with OAuth-state management, SDK-based user fetching, and GitHub-only API calls. The credential storage uses GitHub field names (`githubToken`, `githubLogin`) on both `Workspace` and `Tenant` models.

Git operations rely on a credential helper injected into Docker containers that echoes `GITHUB_USER`/`GITHUB_TOKEN` for all remotes — there's no per-remote matching, and the env var names are GitHub-specific.

The Telegram UX treats OAuth as first-class with URL buttons, while PAT is a text-based afterthought with no loading states, no validation feedback beyond pass/fail, and no example-driven guidance.

## Goals / Non-Goals

**Goals:**
- Remove all GitHub OAuth code (controller, service methods, config, env vars)
- Rename all GitHub-specific fields and services to generic git naming
- Implement PAT-based credential validation using `git ls-remote` (works with GitHub, GitLab, Bitbucket, Gitea, self-hosted, etc.)
- Implement six UX states with built-in user-facing examples at every step
- Auto-detect expired/revoked tokens during git operations → clear + notify with re-login example
- Replace `/login github` and `/logout` with `/git login`, `/git logout`, `/git status`, `/git test`

**Non-Goals:**
- Multiple credentials per workspace (scope: one set per workspace, matched by remote URL host)
- SSH key support (HTTPS + PAT only)
- Per-project credential mapping (all projects in a workspace share the same credential)
- Credential rotation or expiry scheduling (detected reactively on git failure)

## Decisions

### Decision: Validate via `git ls-remote` instead of provider API calls

**Why:** Provider APIs differ — GitHub uses `GET /user`, GitLab uses `GET /api/v4/user`, Bitbucket uses `GET /2.0/user`, self-hosted instances have custom URLs. `git ls-remote` works identically across every git-over-HTTPS provider because it uses the same git transport layer. It returns exit code 0 on success and 128 on auth failure.

**Alternatives considered:**
- Provider-specific API validation — requires URL-to-provider mapping, API version handling, token format detection. Too complex and fragile for unknown providers.
- No validation (store blindly) — poor UX, user discovers bad tokens only on first git op.

### Decision: One credential per workspace, applied globally to all remotes

**Why:** The user confirmed one credential per workspace. The git credential helper is configured globally inside the container — any `git clone/push/pull` against any HTTPS remote uses these credentials. This maps to the common case: one developer, one git identity, one workspace.

**Trade-off:** If a workspace has projects on two different providers with different credentials, only one set works. This is acceptable for the common case and can be extended later with per-remote credential helper entries.

### Decision: Rename env vars but provide backward-compat aliases

**Why:** OpenCode CLI and `gh` CLI may reference `GITHUB_TOKEN` internally. Setting both `GIT_TOKEN` and `GITHUB_TOKEN` ensures nothing breaks during the transition. The credential helper uses `GIT_TOKEN`/`GIT_USERNAME` as the primary source.

### Decision: Remove Tenant-level credential fallback

**Why:** The proposal removes `Tenant.githubToken`, `Tenant.githubLogin`, `Tenant.githubAvatar`. Credentials are strictly per-workspace. This simplifies the fallback chain (`workspace.gitToken` with no tenant fallback) and removes GitHub-specific avatar storage. If a user needs the same token across workspaces, they set it per workspace — the UX is fast enough that this isn't burdensome.

### Decision: Six explicit UX states with inline examples

**Why:** Telegram is an ephemeral medium — users can't hover for tooltips or navigate to docs. Every message must be self-contained. Each state message includes:
- Current status (icon + short description)
- Actionable next steps
- A concrete example the user can copy-paste and modify

States:
```
EMPTY    → "No credentials set" + link to token page + example command
LOADING  → "Validating..." + masked token display
SUCCESS  → "Verified as @user" + masked token + next steps
ERROR    → "Failed" + reason + corrected example command
EXPIRED  → "Token rejected by server" + auto-cleared + re-login example
STATUS   → "Active" + username + masked token + last verified time
```

## Architecture

### Module Structure After Changes

```
src/modules/git-auth/                    ← renamed from github-auth
├── git-auth.module.ts                   ← renamed, no controller
└── git-auth.service.ts                  ← renamed, stripped of OAuth

src/modules/git-commands/                ← unchanged
└── git-commands.service.ts              ← unchanged (already generic)

src/modules/workspace/
├── workspace.service.ts                 ← rename field references
└── docker-workspace.service.ts          ← rename env vars + credential helper
```

### Data Model Changes

```prisma
model Workspace {
  // ... existing fields ...
  gitToken    String?   // was githubToken
  gitUsername String?   // was githubLogin
  // githubToken removed
  // githubLogin removed
}

model Tenant {
  // ... existing fields ...
  // githubToken removed
  // githubLogin removed
  // githubAvatar removed
}
```

### Validation Flow

```
User: /git login alice ghp_abc123 https://github.com/org/repo.git

1. Parse args: username="alice", token="ghp_abc123", remoteUrl="https://..."
2. Build authenticated URL: https://alice:ghp_abc123@github.com/org/repo.git
3. Run: git ls-remote <authenticated-url>
4. Exit 0   → Store credentials, show SUCCESS state
   Exit 128 → Parse stderr for clues, show ERROR state with example
```

### Credential Helper Configuration

```bash
# Old (container-workspace):
git config --global credential.helper \
  '!f() { echo "username=$GITHUB_USER"; echo "password=$GITHUB_TOKEN"; }; f'

# New:
git config --global credential.helper \
  '!f() { echo "username=$GIT_USERNAME"; echo "password=$GIT_TOKEN"; }; f'
```

### Container Environment Variables

```
# Always set (new names):
GIT_TOKEN=<token>
GIT_USERNAME=<username>

# Backward-compat aliases (set same values):
GITHUB_TOKEN=<token>
GITHUB_USER=<username>
```

### UX State Machine

```
                    ┌──────────────────────┐
                    │  STATE: EMPTY        │
                    │  No git credentials  │
                    └──────────┬───────────┘
                               │ /git login <user> <token> [url]
                               ▼
                    ┌──────────────────────┐
                    │  STATE: LOADING      │
                    │  git ls-remote ...   │
                    └──────────┬───────────┘
                               │
                    ┌──────────┼───────────┐
                    ▼                      ▼
          ┌──────────────────┐  ┌──────────────────────┐
          │ STATE: SUCCESS   │  │ STATE: ERROR         │
          │ Stored + active  │  │ Auth failed          │
          └────────┬─────────┘  └──────────┬───────────┘
                   │                       │
                   │ /git test             │ /git login ... (retry)
                   ▼                       ▼
          ┌──────────────────┐  ┌──────────────────────┐
          │ STATE: STATUS    │  │ (back to LOADING)    │
          │ Shows info       │  └──────────────────────┘
          └────────┬─────────┘
                   │
                   │ git push fails with 401/403
                   ▼
          ┌──────────────────────┐
          │ STATE: EXPIRED      │
          │ Token cleared       │
          │ "Run /git login..." │
          └──────────────────────┘
```

## Risks / Trade-offs

- **`git ls-remote` requires network** → If the remote URL is unreachable (DNS, firewall), validation fails even with valid credentials. Mitigation: distinguish "auth failed" from "host unreachable" in error messages.
- **Credential exposure in process list** → The token is passed as part of the authenticated URL to `git ls-remote`. On a shared system, other processes could see it in `ps`. Mitigation: the token flows through a Docker container exec, not the host process list; still, use fine-grained tokens with minimal scope.
- **`gh` CLI still expects `GITHUB_TOKEN`** → The PR creation command runs `gh pr create` inside the container, which reads `GITHUB_TOKEN`. Mitigation: set both `GIT_TOKEN` and `GITHUB_TOKEN` env vars.
- **Prisma migration on production DB** → Renaming columns locks the table briefly. Mitigation: add new columns, backfill, deploy code that reads new columns, then drop old columns in a follow-up migration. Or just rename directly since SQLite supports column rename natively.

## Migration Plan

1. **Phase 1 — Rename + Restructure (this change)**
   - Rename DB columns via Prisma migration
   - Rename `GitHubAuthService` → `GitAuthService`, strip OAuth, add `git ls-remote` validation
   - Rename `GitHubAuthModule` → `GitAuthModule`, remove controller
   - Delete `GitHubAuthController`
   - Update all field references across codebase
   - Rename Docker env vars + credential helper
   - Update Telegram commands, help text, setup wizard
   - Update `.env.example` and config

2. **Phase 2 — UX Polish**
   - Add `/git test` command for re-validation
   - Add auto-detect + clear on git 401/403
   - Add token-masked status display
   - Add inline examples to every state message

3. **Rollback**
   - Revert Prisma migration (rename columns back)
   - Restore `GitHubAuthService` and `GitHubAuthController` from git history
   - Restore config env vars in `.env`
   - Restore `/login`/`/logout` commands
