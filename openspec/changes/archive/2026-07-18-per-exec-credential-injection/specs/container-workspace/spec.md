## MODIFIED Requirements

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
