## Purpose

Per-exec credential injection for workspace containers: provider API keys and git credentials are injected as environment variables on each `docker exec` call rather than being baked into the container at creation time. Credentials are sourced from the workspace record, which is configured through the Settings hub.

## MODIFIED Requirements

### Requirement: Immediate credential effect without container restart — Provider key change (MODIFIED)

#### Scenario: Provider key change takes effect immediately
- **WHEN** a user updates the provider API key via the Settings hub or `/workspace provider`
- **THEN** the next session start SHALL use the new key
- **AND** no container restart SHALL be needed

#### Scenario: Git token update takes effect immediately
- **WHEN** a user updates git credentials via the Settings hub or `/git login`
- **THEN** the next git operation SHALL use the new credentials
- **AND** no container restart SHALL be needed
