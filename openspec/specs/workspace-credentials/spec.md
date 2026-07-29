## Purpose

Per-workspace credential storage and container environment injection. Each workspace stores its own provider API keys and git credentials, isolated from other workspaces. Supports per-workspace git credential management via personal access tokens and a guided setup wizard.

## Requirements

### Requirement: Per-workspace provider API key storage

Each workspace SHALL store its own provider API key. The `Workspace` model SHALL include an `apiKey` field. When creating or updating a workspace, the user MAY provide an API key. When a session is started, the session service SHALL read the API key from the workspace record and pass it as an environment variable on the `docker exec` command — NOT on the container itself.

#### Scenario: Setting API key via Settings hub
- **WHEN** user taps [Change] next to Provider on the Settings screen
- **AND** selects a provider from the provider picker
- **AND** enters the API key as a text message
- **THEN** the workspace record SHALL store `providerId` and `apiKey`
- **AND** the container SHALL NOT have the API key in its environment
- **AND** the API key SHALL be injected via `-e <PROVIDER_ID>_API_KEY=<key>` on subsequent session `docker exec` calls

#### Scenario: Updating API key
- **WHEN** user changes the provider API key via the Settings hub or `/workspace provider`
- **THEN** the workspace record SHALL update its `apiKey`
- **AND** the next session SHALL receive the new key via `docker exec -e`
- **AND** no container restart SHALL occur

#### Scenario: Workspace without an API key
- **WHEN** a workspace has no `apiKey` set and a session tries to start
- **THEN** the bot SHALL warn the user that no API key is configured and suggest setting one

### Requirement: Per-workspace git credential storage

Each workspace SHALL store its own `gitToken` and `gitUsername`. The `Workspace` model SHALL include both fields. When a git operation is executed, `GIT_TOKEN` and `GIT_USERNAME` env vars SHALL be passed as `-e` flags on the `docker exec` call. There SHALL be no tenant-level credential fallback.

#### Scenario: Docker exec receives per-workspace git credentials
- **WHEN** a workspace has `gitToken: "ghp_abc"` and `gitUsername: "user1"`
- **AND** a git command is executed via `docker exec`
- **THEN** the exec command SHALL include `-e GIT_TOKEN=ghp_abc -e GIT_USERNAME=user1`
- **AND** the container SHALL NOT have these env vars in its persistent environment

#### Scenario: No tenant-level credential fallback
- **WHEN** a workspace has no `gitToken` set
- **THEN** the system SHALL return `null` for credentials
- **AND** SHALL prompt the user to set credentials via `/git login`

### Requirement: Interactive git credential setup per workspace

The system SHALL support setting git credentials via the Settings hub or the `/git login` command, scoped to a specific workspace. Validation SHALL use `git ls-remote` against the first project's remote URL or a user-provided URL.

#### Scenario: Set credentials via Settings hub
- **WHEN** user opens the git management sub-screen from Settings
- **AND** enters username and token
- **THEN** the system SHALL validate via `git ls-remote`
- **AND** store `gitToken` and `gitUsername` on the active workspace
- **AND** edit the message back to Settings with updated status

#### Scenario: Set credentials via /git login
- **WHEN** user runs `/git login myuser ghp_abc123 https://gitlab.com/group/repo.git`
- **THEN** the system SHALL validate via `git ls-remote`
- **AND** store `gitToken` and `gitUsername` on the active workspace
- **AND** send a success notification to the user's Telegram chat

#### Scenario: Credential validation failure
- **WHEN** `git ls-remote` fails against the provided URL
- **THEN** the system SHALL NOT store the credentials
- **AND** SHALL send an error notification with possible causes and a corrected example

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

The system SHALL configure git's credential helper inline per `docker exec` using `GIT_USERNAME` and `GIT_TOKEN` passed as `-e` env vars. For backward compatibility, both sets of env vars SHALL be set.

#### Scenario: Configure git auth per docker exec
- **WHEN** a git command is executed inside a container via `docker exec`
- **THEN** the system SHALL wrap the command in `sh -c` that runs `git config --global credential.helper` before the real git command
- **AND** SHALL pass `-e GIT_USERNAME=<user> -e GIT_TOKEN=<token> -e GITHUB_USER=<user> -e GITHUB_TOKEN=<token>`

### Requirement: Credential isolation between workspaces

Credentials stored on one workspace SHALL NOT be accessible to another workspace's container. Each container SHALL only receive environment variables from its own workspace record.

#### Scenario: Two workspaces with different credentials
- **WHEN** Workspace A has `apiKey: "sk-A"` and Workspace B has `apiKey: "sk-B"`
- **THEN** Workspace A's container SHALL NOT have `sk-B` in its environment
- **AND** Workspace B's container SHALL NOT have `sk-A` in its environment

### Requirement: Token masking in all outputs

The system SHALL mask git tokens when displaying them in any bot message. Only the first 4 and last 4 characters SHALL be visible.

#### Scenario: Masked token in status
- **WHEN** the system displays credential status
- **THEN** the token SHALL appear as the first 4 characters, `****`, then the last 4 characters
