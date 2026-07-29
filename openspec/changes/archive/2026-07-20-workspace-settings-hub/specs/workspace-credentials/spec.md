## Purpose

Per-workspace credential storage and container environment injection. Each workspace stores its own provider API keys and git credentials, isolated from other workspaces. Supports per-workspace git credential management via personal access tokens. Configuration is managed through the unified Settings hub.

## MODIFIED Requirements

### Requirement: Interactive setup wizard (REMOVED)

**Reason:** Replaced by the unified Settings hub. The `/setup` command now opens the Settings screen directly instead of launching a separate 4-step wizard.

**Migration:** Users configure provider, model, and git credentials through the Settings hub. The `/setup` command is retained as a shortcut that opens Settings for the active workspace.

### Requirement: Per-workspace provider API key storage (MODIFIED)

Each workspace SHALL store its own provider API key. The `Workspace` model SHALL include an `apiKey` field. When creating or updating a workspace, the user MAY provide an API key via the Settings hub or the `/workspace provider` command. When a session is started, the session service SHALL read the API key from the workspace record and pass it as an environment variable on the `docker exec` command — NOT on the container itself.

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
- **WHEN** a workspace has no `apiKey` set
- **THEN** the Settings screen SHALL show a clear indicator that no provider is configured
- **AND** when a session tries to start, the bot SHALL warn the user

### Requirement: Interactive git credential setup per workspace (MODIFIED)

The system SHALL support setting git credentials via the Settings hub or the `/git login` command, scoped to a specific workspace. Validation SHALL use `git ls-remote` against the first project's remote URL or a user-provided URL.

#### Scenario: Set credentials via Settings hub
- **WHEN** user opens the git management sub-screen from Settings
- **AND** enters username and token
- **THEN** the system SHALL validate via `git ls-remote`
- **AND** store `gitToken` and `gitUsername` on the active workspace
- **AND** edit the message back to Settings with updated status

#### Scenario: Set credentials via /git login
- **WHEN** user runs `/git login myuser ghp_abc123 https://gitlab.com/group/repo.git`
- **THEN** the system SHALL validate and store credentials via the same service method as the Settings hub
- **AND** send a success notification

## REMOVED Requirements

### Requirement: Per-workspace provider API key storage — Creating workspace with API key

**Reason:** The create-with-API-key flow is replaced by the Settings hub. Workspaces are created without API keys; keys are configured afterward through Settings.

**Migration:** Create workspace with `/workspace create <name>`, then configure provider and key through the Settings hub.
