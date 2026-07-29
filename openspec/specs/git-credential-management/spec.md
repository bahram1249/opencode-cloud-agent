## Purpose

Provider-agnostic git credential management for workspace containers. Supports setting, validating, testing, and removing git credentials via personal access tokens. Credentials are validated using `git ls-remote` which works with any git-over-HTTPS provider.

## Requirements

### Requirement: Provider-agnostic git credential storage

The system SHALL store git credentials as `gitToken` and `gitUsername` on the `Workspace` model. Credentials SHALL be configurable through the Settings hub or via the `/git login` command. Credentials SHALL be per-workspace — there is no tenant-level credential fallback.

#### Scenario: Store credentials via Settings hub
- **WHEN** a user sets git credentials through the git management sub-screen in Settings
- **THEN** the workspace record SHALL store `gitToken` and `gitUsername`
- **AND** `GIT_TOKEN` and `GIT_USERNAME` SHALL be passed as `-e` env vars on subsequent `docker exec` calls for git operations

#### Scenario: Store credentials via /git login
- **WHEN** user runs `/git login myuser ghp_abc123 https://github.com/org/repo.git`
- **THEN** the system SHALL validate and store credentials via the same service method
- **AND** the credential status SHALL be reflected in the Settings hub

#### Scenario: Retrieve credentials for git operations
- **WHEN** a git operation (clone, pull, push) is performed
- **THEN** the system SHALL read `gitToken` and `gitUsername` from the active workspace
- **AND** pass them as `-e GIT_USERNAME=<username> -e GIT_TOKEN=<token>` on the `docker exec` command
- **AND** configure the git credential helper inline via `sh -c` before executing the git command

### Requirement: Six UX states with inline examples

The system SHALL present git credential information in six distinct states in both the Settings hub git management sub-screen and via `/git credential-status`, each with an icon, status description, actionable next steps, and a concrete example.

#### Scenario: Empty state in Settings
- **WHEN** no git credentials are set on the workspace
- **THEN** the git row in Settings SHALL show: "🔑 Git: Not configured"
- **AND** tapping [Manage] SHALL show the empty state with setup instructions

#### Scenario: Loading state
- **WHEN** a credential validation is in progress
- **THEN** the system SHALL display: "⏳ Validating git credentials..." with the remote URL being tested

#### Scenario: Success state in Settings
- **WHEN** credentials are validated and stored
- **THEN** the git row in Settings SHALL show: "🔑 Git: ✅ logged in as username"
- **AND** tapping [Manage] SHALL show the full success state with masked token and actions

#### Scenario: Error state
- **WHEN** credential validation fails
- **THEN** the system SHALL display: "❌ Authentication failed" with possible causes and a corrected example command

#### Scenario: Expired state (auto-detected)
- **WHEN** a git operation fails with 401 or 403
- **THEN** the system SHALL clear the workspace's `gitToken` and `gitUsername`
- **AND** SHALL notify the user with a re-login example

#### Scenario: Status state
- **WHEN** user runs `/git status`
- **THEN** the system SHALL display the current credential status with username, masked token, remote URL, and available actions

### Requirement: Token masking in display

The system SHALL never display the full token in any message. Only the first 4 and last 4 characters SHALL be shown, joined by `****`.

#### Scenario: Display masked token
- **WHEN** displaying credential status
- **THEN** token `ghp_abcdef12345678` SHALL appear as `ghp_****5678`

### Requirement: Credential removal

The system SHALL allow users to remove git credentials from a workspace via the Settings hub or `/git logout`.

#### Scenario: Manual removal via Settings
- **WHEN** user taps [Logout] in the git management sub-screen from Settings
- **THEN** the system SHALL clear `gitToken` and `gitUsername` on the active workspace
- **AND** edit the message to show the empty state

#### Scenario: Manual removal via /git logout
- **WHEN** user runs `/git logout`
- **THEN** the system SHALL clear `gitToken` and `gitUsername` via the same service method
- **AND** the Settings hub SHALL reflect the cleared state

#### Scenario: Auto-clear on git auth failure
- **WHEN** a git push, pull, or clone returns a 401 or 403 HTTP status
- **THEN** the system SHALL automatically clear the workspace's `gitToken` and `gitUsername`
- **AND** SHALL notify the user with the EXPIRED state message
