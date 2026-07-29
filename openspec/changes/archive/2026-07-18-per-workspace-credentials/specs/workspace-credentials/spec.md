## ADDED Requirements

### Requirement: Per-workspace provider API key storage

Each workspace SHALL store its own provider API key. The `Workspace` model SHALL include an `apiKey` field. When creating or updating a workspace, the user MAY provide an API key. The `DockerWorkspaceService` SHALL read the API key from the workspace record when building container environment variables, not from `.env` or global configuration.

When a workspace container is started or restarted, the container SHALL receive the provider API key as an environment variable named `<PROVIDER_ID_UPPERCASE>_API_KEY` (e.g., `OPENAI_API_KEY`).

#### Scenario: Creating workspace with API key
- **WHEN** user runs `/workspace create myproj --provider openai --api-key sk-abc123`
- **THEN** the workspace record SHALL store `providerId: "openai"` and `apiKey: "sk-abc123"`
- **AND** the container SHALL have `OPENAI_API_KEY=sk-abc123` in its environment

#### Scenario: Updating API key on existing workspace
- **WHEN** user runs `/workspace provider myproj --api-key sk-xyz789`
- **THEN** the workspace record SHALL update its `apiKey` to `"sk-xyz789"`
- **AND** the container SHALL be re-created or restarted with the new environment variable

#### Scenario: Workspace without an API key
- **WHEN** a workspace has no `apiKey` set and a session tries to start
- **THEN** the bot SHALL warn the user that no API key is configured and suggest setting one

### Requirement: Per-workspace GitHub token storage

Each workspace SHALL store its own `githubToken` and `githubLogin`. The `Workspace` model SHALL include both fields. When a container is started, `GITHUB_TOKEN` and `GITHUB_USER` env vars SHALL be set from the workspace record, not from the `Tenant` model.

For backward compatibility during migration, if a workspace has no `githubToken` but the parent `Tenant` does, the system MAY fall back to the Tenant-level token.

#### Scenario: Container receives per-workspace GitHub token
- **WHEN** a workspace has `githubToken: "ghp_abc"` and `githubLogin: "user1"`
- **AND** `ensureContainer()` is called
- **THEN** the container SHALL have `GITHUB_TOKEN=ghp_abc` and `GITHUB_USER=user1` in its environment

#### Scenario: Fallback to tenant token
- **WHEN** a workspace has no `githubToken`
- **BUT** the parent tenant has `githubToken: "ghp_xyz"`
- **THEN** the container SHALL receive `GITHUB_TOKEN=ghp_xyz` from the tenant

### Requirement: Interactive GitHub OAuth per workspace

The system SHALL support initiating a GitHub OAuth flow scoped to a specific workspace. The OAuth state parameter SHALL include the `workspaceId` alongside `telegramUserId` and `chatId`. On successful callback, the access token and GitHub login SHALL be stored on the `Workspace` record.

The bot SHALL provide a command to initiate this flow: `/workspace github-login <workspace-name>`.

#### Scenario: Initiate GitHub login for workspace
- **WHEN** user runs `/workspace github-login myproj`
- **THEN** the bot SHALL generate a GitHub OAuth URL with `workspaceId` in the state
- **AND** send the URL to the user with instructions to click and authorize

#### Scenario: OAuth callback stores token on workspace
- **WHEN** GitHub redirects to the callback URL with a valid `code` and `state`
- **AND** the state contains a valid `workspaceId`
- **THEN** the system SHALL exchange the code for an access token
- **AND** store `githubToken` and `githubLogin` on the workspace identified by `workspaceId`
- **AND** send a success notification to the user's Telegram chat

#### Scenario: OAuth with expired state
- **WHEN** the callback is received with an expired or invalid state
- **THEN** the system SHALL reject the request
- **AND** notify the user that the authorization expired and they should try again

### Requirement: Interactive setup wizard

The bot SHALL provide a `/setup` command that guides the user through workspace configuration step by step. The wizard SHALL:
1. Prompt the user to select an AI provider from a list (OpenCode Zen/Go, OpenAI, Anthropic, GitHub Copilot)
2. Accept the provider API key via text message
3. Wait for the container to start, then list available models for the selected provider
4. Let the user pick a default model
5. Optionally offer GitHub login

#### Scenario: Setup wizard full flow
- **WHEN** user runs `/setup`
- **THEN** the bot SHALL show provider selection inline buttons
- **WHEN** user selects a provider
- **THEN** the bot SHALL ask for the API key
- **WHEN** user sends the API key
- **THEN** the bot SHALL configure the provider and show the model picker
- **WHEN** user selects a model
- **THEN** the bot SHALL offer GitHub login or skip
- **WHEN** user completes all steps
- **THEN** the bot SHALL confirm setup is complete

### Requirement: Credential isolation between workspaces

Credentials stored on one workspace SHALL NOT be accessible to another workspace's container. Each container SHALL only receive environment variables from its own workspace record.

#### Scenario: Two workspaces with different credentials
- **WHEN** Workspace A has `apiKey: "sk-A"` and Workspace B has `apiKey: "sk-B"`
- **THEN** Workspace A's container SHALL NOT have `sk-B` in its environment
- **AND** Workspace B's container SHALL NOT have `sk-A` in its environment
