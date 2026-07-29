## MODIFIED Requirements

### Requirement: Per-workspace provider API key storage

Each workspace SHALL store its own provider API key. The `Workspace` model SHALL include an `apiKey` field. When creating or updating a workspace, the user MAY provide an API key. When a session is started, the session service SHALL read the API key from the workspace record and pass it as an environment variable on the `docker exec` command — NOT on the container itself.

#### Scenario: Creating workspace with API key
- **WHEN** user runs `/workspace create myproj --provider openai --api-key sk-abc123`
- **THEN** the workspace record SHALL store `providerId: "openai"` and `apiKey: "sk-abc123"`
- **AND** the container SHALL NOT have `OPENAI_API_KEY` in its environment
- **AND** the API key SHALL be injected via `-e OPENAI_API_KEY=sk-abc123` on subsequent session `docker exec` calls

#### Scenario: Updating API key on existing workspace
- **WHEN** user runs `/workspace provider myproj --api-key sk-xyz789`
- **THEN** the workspace record SHALL update its `apiKey` to `"sk-xyz789"`
- **AND** the next session SHALL receive the new key via `docker exec -e`
- **AND** no container restart SHALL occur
