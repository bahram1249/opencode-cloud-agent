## ADDED Requirements

### Requirement: Container per workspace
The system SHALL create a dedicated Docker container for every workspace. The container SHALL use the `opencode-cloud-agent/workspace` image with `/workspace` as the working directory.

#### Scenario: Create workspace container
- **WHEN** a workspace is created
- **THEN** the system creates a Docker container with:
  - Image: `opencode-cloud-agent/workspace:latest`
  - WorkingDir: `/workspace`
  - Cmd: `['sleep', 'infinity']`
  - Volume mount: auto-assigned host path → `/workspace`
  - Labels: `opencode-cloud-agent.workspaceId`, `opencode-cloud-agent.tenantId`

#### Scenario: Auto-assign host path
- **WHEN** a workspace is created without an explicit host path
- **THEN** the system assigns `{workspaceRoot}/{tenantId}/{workspaceName}` as the host path (sanitized) and creates the directory

#### Scenario: Start stopped container
- **WHEN** `ensureContainer()` is called for a workspace with an existing but stopped container
- **THEN** the system starts the container and returns its ID

#### Scenario: Container already running
- **WHEN** `ensureContainer()` is called for a workspace with a running container
- **THEN** the system returns the existing container ID without modification

### Requirement: Container environment injection
The system SHALL inject environment variables into the workspace container, including provider API keys and GitHub credentials.

#### Scenario: GitHub credentials in container env
- **WHEN** a container is created or restarted for a tenant with a stored `githubToken`
- **THEN** the system sets `GITHUB_TOKEN` and `GITHUB_USER` environment variables on the container

#### Scenario: Provider API key in container env
- **WHEN** a container is created or restarted for a workspace with a configured provider and API key
- **THEN** the system sets `{PROVIDER_ID}_API_KEY` environment variable on the container (e.g., `ANTHROPIC_API_KEY`)

### Requirement: Git credential configuration on container start
The system SHALL configure git's credential helper inside the container to use the injected `GITHUB_TOKEN` after the container starts.

#### Scenario: Configure git auth
- **WHEN** a container starts (or `ensureContainer()` runs)
- **THEN** the system runs `docker exec` with: `git config --global credential.helper '!f() { echo "username=$GITHUB_USER"; echo "password=$GITHUB_TOKEN"; }; f'`

### Requirement: Container removal
The system SHALL remove the workspace container when the workspace is deleted.

#### Scenario: Remove container on workspace delete
- **WHEN** a workspace is deleted
- **THEN** the system runs `docker rm -f` on the associated container
