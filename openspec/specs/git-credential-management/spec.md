## Purpose

Provider-agnostic git credential management for workspace containers. Supports setting, validating, testing, and removing git credentials via personal access tokens. Credentials are validated using `git ls-remote` which works with any git-over-HTTPS provider.

## Requirements

### Requirement: Provider-agnostic git credential storage

The system SHALL store git credentials as `gitToken` and `gitUsername` on the `Workspace` model. These replace the GitHub-specific `githubToken` and `githubLogin` fields. Credentials SHALL be per-workspace — there is no tenant-level credential fallback.

#### Scenario: Store credentials on workspace
- **WHEN** a user sets git credentials via `/git login`
- **THEN** the workspace record SHALL store `gitToken` and `gitUsername`
- **AND** `GIT_TOKEN` and `GIT_USERNAME` SHALL be passed as `-e` env vars on subsequent `docker exec` calls for git operations
- **AND** the container SHALL NOT have `GIT_TOKEN` or `GIT_USERNAME` in its persistent environment

#### Scenario: Retrieve credentials for git operations
- **WHEN** a git operation (clone, pull, push) is performed
- **THEN** the system SHALL read `gitToken` and `gitUsername` from the active workspace
- **AND** pass them as `-e GIT_USERNAME=<username> -e GIT_TOKEN=<token>` on the `docker exec` command
- **AND** configure the git credential helper inline via `sh -c` before executing the git command

### Requirement: Six UX states with inline examples

The system SHALL present git credential information in six distinct states, each with an icon, status description, actionable next steps, and a concrete example.

#### Scenario: Empty state
- **WHEN** no git credentials are set on the workspace
- **THEN** the system SHALL display: "🔑 Git Credentials — Not configured" with instructions and links to common provider token pages

#### Scenario: Loading state
- **WHEN** a credential validation is in progress
- **THEN** the system SHALL display: "⏳ Validating git credentials..." with the remote URL being tested

#### Scenario: Success state
- **WHEN** credentials are validated and stored
- **THEN** the system SHALL display: "✅ Git credentials verified!" with username, masked token, remote URL, and ref count

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

The system SHALL allow users to remove git credentials from a workspace.

#### Scenario: Manual removal
- **WHEN** user runs `/git logout`
- **THEN** the system SHALL clear `gitToken` and `gitUsername` on the active workspace
- **AND** SHALL display a logout confirmation with a re-login example

#### Scenario: Auto-clear on git auth failure
- **WHEN** a git push, pull, or clone returns a 401 or 403 HTTP status
- **THEN** the system SHALL automatically clear the workspace's `gitToken` and `gitUsername`
- **AND** SHALL notify the user with the EXPIRED state message
