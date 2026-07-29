## Purpose

Automatic injection and management of AI provider API tokens inside workspace containers, ensuring provider credentials persist across container restarts and are always available to the OpenCode CLI.

## Requirements

### Requirement: Auto-inject provider tokens on container ensure
The system SHALL automatically inject the workspace's AI provider API key into the Docker container every time the container is ensured or a docker exec command is prepared, so the user never has to manually re-configure the provider token.

#### Scenario: Provider token injected on container ensure
- **WHEN** a container is ensured for a workspace that has a providerId and apiKey configured
- **THEN** the system SHALL include the provider's `*_API_KEY` in the credentials file written to the container
- **AND** the OpenCode CLI SHALL have access to the provider token without additional configuration

#### Scenario: Provider token visible in credential status
- **WHEN** a user views credential status via `/git credential-status` or the Mini App git settings page
- **THEN** the system SHALL display the provider name and whether a token is configured
- **AND** SHALL mask the token value (show first 4 + last 4 characters)

### Requirement: Provider token management UI
Both the Telegram Bot and Mini App SHALL provide a UI to view and update the provider API key associated with a workspace.

#### Scenario: Bot provider token status
- **WHEN** a user runs `/git credential-status` in the Telegram Bot
- **THEN** the response SHALL include the provider name and token status (configured / not configured)
- **AND** SHALL display the masked token if configured

#### Scenario: Mini App provider token section
- **WHEN** a user opens workspace settings in the Mini App
- **THEN** the Git Credentials section SHALL also show the provider token status
- **AND** SHALL provide a field to update the provider API key

#### Scenario: Update provider token via bot
- **WHEN** a user runs `/workspace provider <id> <key>` in the Telegram Bot
- **THEN** the system SHALL store the encrypted provider API key
- **AND** SHALL re-ensure the container so the new token is immediately available

#### Scenario: Update provider token via Mini App
- **WHEN** a user updates the API key field in the Mini App workspace settings and clicks Save
- **THEN** the system SHALL store the encrypted provider API key
- **AND** SHALL re-ensure the container so the new token is immediately available
