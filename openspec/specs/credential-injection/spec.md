## Purpose

Per-exec credential injection for workspace containers: provider API keys and git credentials are injected as environment variables on each `docker exec` call rather than being baked into the container at creation time. Credentials are never persisted inside the container.

## Requirements

### Requirement: Per-exec credential injection for OpenCode sessions

When a workspace container runs an OpenCode CLI session, the system SHALL pass the provider API key as an environment variable on the `docker exec` command. The variable SHALL NOT be set on the container itself. The variable name SHALL be `<PROVIDER_ID_UPPERCASE>_API_KEY` (e.g., `OPENAI_API_KEY`).

#### Scenario: Provider API key passed via docker exec -e
- **WHEN** a session is started or a follow-up prompt is sent
- **THEN** the system SHALL execute `docker exec -e <PROVIDER_ID>_API_KEY=<apiKey> ... opencode --prompt ...`
- **AND** the container SHALL NOT have the API key in its environment outside of that exec

### Requirement: Per-exec credential injection for git operations

When a git operation is performed inside a workspace container, the system SHALL pass git credentials as environment variables on the `docker exec` command. The system SHALL set the credential helper inline via `sh -c` before executing the git command, reading from the passed env vars.

#### Scenario: Git credentials passed via docker exec -e
- **WHEN** a git operation (clone, pull, push, fetch, ls-remote) is performed inside a container
- **THEN** the system SHALL execute `docker exec -e GIT_USERNAME=<username> -e GIT_TOKEN=<token> ... sh -c 'git config --global credential.helper ... && git <operation>'`
- **AND** the git credential helper SHALL read `GIT_USERNAME` and `GIT_TOKEN` from the exec env

#### Scenario: Git status and local operations without credentials
- **WHEN** a git operation does not contact a remote (status, diff, log, branch, checkout)
- **THEN** the system SHALL NOT pass credential env vars
- **AND** the system SHALL NOT wrap the command in `sh -c`

### Requirement: Immediate credential effect without container restart

Credential changes SHALL take effect on the next `docker exec` without requiring a container restart or recreation.

#### Scenario: Provider key change takes effect immediately
- **WHEN** a user updates the provider API key via `/workspace provider`
- **THEN** the next session start SHALL use the new key
- **AND** no container restart SHALL be needed

#### Scenario: Git token update takes effect immediately
- **WHEN** a user updates git credentials via `/git login`
- **THEN** the next git operation SHALL use the new credentials
- **AND** no container restart SHALL be needed
