## Purpose

Authenticated git operations inside workspace containers: clone, pull, push, commit, status, diff, log, branch management, and container path conversion. Git credentials are configured through the unified Settings hub.

## MODIFIED Requirements

### Requirement: Authenticated git clone (MODIFIED)

The system SHALL clone git repositories inside the workspace container using the workspace's git credentials, which are configured through the Settings hub.

#### Scenario: Clone with remote URL
- **WHEN** a project is added with a `remoteUrl` pointing to a git repository
- **THEN** the system runs `git clone <remoteUrl> <targetPath>` via `docker exec` inside the container
- **AND** authenticates using credentials configured through the Settings hub

### Requirement: Authenticated git commit and push (MODIFIED)

The system SHALL allow committing and pushing changes via the container, authenticated with credentials managed through the Settings hub.

#### Scenario: Commit and push
- **WHEN** user runs `/git commit` and `/git push`
- **THEN** the system SHALL commit and push using credentials from the Settings hub
- **AND** git SHALL authenticate via the credential helper configured with `$GIT_USERNAME` and `$GIT_TOKEN`
