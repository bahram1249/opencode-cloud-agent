## Purpose

Container lifecycle management per workspace: each workspace gets a dedicated Docker container. Credentials are injected per-exec via `docker exec -e`, not baked into the container.

## Requirements

### Requirement: Container per workspace

The system SHALL create a dedicated Docker container for every workspace. The container SHALL use the `opencode-cloud-agent/workspace` image with `/workspace` as the working directory. The container SHALL NOT be created with credential environment variables — credentials SHALL be injected via `docker exec -e` at execution time.

#### Scenario: Create workspace container
- **WHEN** a workspace is created
- **THEN** the system creates a Docker container with:
  - Image: `opencode-cloud-agent/workspace:latest`
  - WorkingDir: `/workspace`
  - Cmd: `['sleep', 'infinity']`
  - Volume mount: auto-assigned host path to `/workspace`
  - Labels: `opencode-cloud-agent.workspaceId`, `opencode-cloud-agent.tenantId`
  - No credential environment variables
  - No git credential configuration

#### Scenario: Auto-assign host path
- **WHEN** a workspace is created without an explicit host path
- **THEN** the system assigns `{workspaceRoot}/{tenantId}/{workspaceName}` as the host path (sanitized) and creates the directory

#### Scenario: Start stopped container
- **WHEN** `ensureContainer()` is called for a workspace with an existing but stopped container
- **THEN** the system starts the container and returns its ID

#### Scenario: Container already running
- **WHEN** `ensureContainer()` is called for a workspace with a running container
- **THEN** the system returns the existing container ID without modification

### Requirement: Container removal

The system SHALL remove the workspace container when the workspace is deleted.

#### Scenario: Remove container on workspace delete
- **WHEN** a workspace is deleted
- **THEN** the system runs `docker rm -f` on the associated container
