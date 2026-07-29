## Purpose

Provider-agnostic git credential management for workspace containers — managed through the unified Settings hub. Supports setting, validating, testing, and removing git credentials via personal access tokens. Gateway commands (`/git login`, `/git logout`) remain functional as shortcuts that route through the same service layer used by the Settings hub.

## MODIFIED Requirements

### Requirement: Provider-agnostic git credential storage (MODIFIED)

The system SHALL store git credentials as `gitToken` and `gitUsername` on the `Workspace` model. Credentials SHALL be configurable through the Settings hub or via the `/git login` command. Credentials SHALL be per-workspace — there is no tenant-level credential fallback.

#### Scenario: Store credentials via Settings hub
- **WHEN** a user sets git credentials through the git management sub-screen in Settings
- **THEN** the workspace record SHALL store `gitToken` and `gitUsername`
- **AND** `GIT_TOKEN` and `GIT_USERNAME` SHALL be passed as `-e` env vars on subsequent `docker exec` calls for git operations

#### Scenario: Store credentials via /git login
- **WHEN** user runs `/git login myuser ghp_abc123 https://github.com/org/repo.git`
- **THEN** the system SHALL validate and store credentials via the same service method
- **AND** the credential status SHALL be reflected in the Settings hub

### Requirement: Six UX states with inline examples (MODIFIED)

The system SHALL present git credential information in six distinct states in both the Settings hub git management sub-screen and via `/git credential-status`.

#### Scenario: Empty state in Settings
- **WHEN** no git credentials are set on the workspace
- **THEN** the git row in Settings SHALL show: "🔑 Git: Not configured"
- **AND** tapping [Manage] SHALL show the empty state with setup instructions

#### Scenario: Success state in Settings
- **WHEN** credentials are validated and stored
- **THEN** the git row in Settings SHALL show: "🔑 Git: ✅ logged in as username"
- **AND** tapping [Manage] SHALL show the full success state with masked token and actions

### Requirement: Credential removal (MODIFIED)

The system SHALL allow users to remove git credentials from a workspace via the Settings hub or `/git logout`.

#### Scenario: Manual removal via Settings
- **WHEN** user taps [Logout] in the git management sub-screen from Settings
- **THEN** the system SHALL clear `gitToken` and `gitUsername` on the active workspace
- **AND** edit the message to show the empty state

#### Scenario: Manual removal via /git logout
- **WHEN** user runs `/git logout`
- **THEN** the system SHALL clear `gitToken` and `gitUsername` via the same service method
- **AND** the Settings hub SHALL reflect the cleared state
