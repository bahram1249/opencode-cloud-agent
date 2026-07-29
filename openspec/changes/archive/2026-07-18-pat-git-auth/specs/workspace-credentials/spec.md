## MODIFIED Requirements

### Requirement: Per-workspace git credential storage

Each workspace SHALL store its own `gitToken` and `gitUsername`. When a container is started, `GIT_TOKEN` and `GIT_USERNAME` env vars SHALL be set from the workspace record. The `Tenant` model SHALL no longer store token or login fields.

#### Scenario: Container receives per-workspace git credentials
- **WHEN** a workspace has `gitToken: "ghp_abc"` and `gitUsername: "user1"`
- **AND** `ensureContainer()` is called
- **THEN** the container SHALL have `GIT_TOKEN=ghp_abc` and `GIT_USERNAME=user1` in its environment

#### Scenario: No tenant-level credential fallback
- **WHEN** a workspace has no `gitToken` set
- **THEN** the system SHALL return `null` for credentials
- **AND** SHALL prompt the user to set credentials via `/git login`

### Requirement: Interactive git credential setup per workspace

The system SHALL support setting git credentials via a personal access token and username, scoped to a specific workspace. Validation SHALL use `git ls-remote` against the first project's remote URL or a user-provided URL.

#### Scenario: Set credentials via command
- **WHEN** user runs `/git login myuser ghp_abc123 https://gitlab.com/group/repo.git`
- **THEN** the system SHALL validate via `git ls-remote`
- **AND** store `gitToken` and `gitUsername` on the active workspace
- **AND** send a success notification to the user's Telegram chat

#### Scenario: Credential validation failure
- **WHEN** `git ls-remote` fails against the provided URL
- **THEN** the system SHALL NOT store the credentials
- **AND** SHALL send an error notification with possible causes and a corrected example

### Requirement: Interactive setup wizard (updated step 4)

The bot SHALL provide a `/setup` command. Step 4 SHALL offer git credential entry or skip. There SHALL be no OAuth path.

#### Scenario: Setup wizard git step
- **WHEN** user reaches step 4 of the setup wizard
- **THEN** the bot SHALL show: "🔑 Git Login (optional)"
- **AND** SHALL offer: `Enter Token` button and `Skip` button
- **AND** SHALL NOT show any OAuth URL button

### Requirement: Credential revocation

The system SHALL allow a user to remove their git credentials, and SHALL automatically clear credentials when git operations fail with authentication errors.

#### Scenario: Manual credential removal
- **WHEN** user runs `/git logout`
- **THEN** the system SHALL clear `gitToken` and `gitUsername` on the active workspace
- **AND** notify the user with a logout confirmation message

#### Scenario: Auto-clear on git auth failure
- **WHEN** a git operation fails with a 401 or 403 response
- **THEN** the system SHALL clear the workspace's `gitToken` and `gitUsername`
- **AND** notify the user to re-authenticate with a re-login example

### Requirement: Generic git credential helper configuration

The system SHALL configure git's credential helper inside the workspace container using `GIT_USERNAME` and `GIT_TOKEN` instead of `GITHUB_USER` and `GITHUB_TOKEN`. For backward compatibility, both env var names SHALL be set.

#### Scenario: Configure git auth on container start
- **WHEN** a container starts (or `ensureContainer()` runs)
- **THEN** the system SHALL run `git config --global credential.helper` using `$GIT_USERNAME` and `$GIT_TOKEN`
- **AND** SHALL set both `GIT_USERNAME=...` and `GITHUB_USER=...` environment variables
- **AND** SHALL set both `GIT_TOKEN=...` and `GITHUB_TOKEN=...` environment variables

### Requirement: Credential isolation between workspaces

Credentials stored on one workspace SHALL NOT be accessible to another workspace's container. Each container SHALL only receive environment variables from its own workspace record.

#### Scenario: Two workspaces with different credentials
- **WHEN** Workspace A has `gitToken: "ghp_A"` and Workspace B has `gitToken: "ghp_B"`
- **THEN** Workspace A's container SHALL NOT have `ghp_B` in its environment
- **AND** Workspace B's container SHALL NOT have `ghp_A` in its environment

## REMOVED Requirements

### Requirement: Interactive GitHub OAuth per workspace

**Reason**: Replaced by generic PAT-based credential management via `/git login`. OAuth required a registered GitHub app, public webhook domain, in-memory state store, and HTTP callback endpoint — all of which added complexity without supporting non-GitHub providers.

**Migration**: Users who previously used OAuth should generate a PAT and run `/git login <username> <token> <remote-url>`.

### Requirement: Token scope validation (GitHub repo scope)

**Reason**: Scope validation was GitHub-specific (`repo` scope check). The new system validates credentials via `git ls-remote`, which implicitly verifies the token has sufficient repository access on any provider.

**Migration**: Token scope is now verified implicitly by successful `git ls-remote`. Users whose tokens lack access will see validation failures and can adjust permissions.

## ADDED Requirements

### Requirement: Token masking in all outputs

The system SHALL mask git tokens when displaying them in any bot message. Only the first 4 and last 4 characters SHALL be visible.

#### Scenario: Masked token in status
- **WHEN** the system displays credential status
- **THEN** the token SHALL appear as the first 4 characters, `****`, then the last 4 characters
