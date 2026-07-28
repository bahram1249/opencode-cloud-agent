## MODIFIED Requirements

### Requirement: Authenticated git commit and push

The system SHALL allow committing and pushing changes via the container, authenticated with credentials managed through the Settings hub.

#### Scenario: Commit and push
- **WHEN** user runs `/git commit` and `/git push`
- **THEN** the system SHALL commit and push using credentials from the Settings hub
- **AND** git SHALL authenticate via the `GIT_ASKPASS` script configured with credentials from `$CREDENTIALS_FILE`
- **AND** SHALL NOT use the previous `$GIT_USERNAME` / `$GIT_TOKEN` env var credential helper pattern

#### Scenario: Stage and commit
- **WHEN** a user requests a git commit with paths and a message
- **THEN** the system runs `git add <pathspec>` and `git commit -m <message>` via `docker exec` inside the container

#### Scenario: Push to remote
- **WHEN** a user requests a git push to a remote branch
- **THEN** the system runs `git push -u <remote> <branch>` via `docker exec` inside the container
- **AND** authenticates using the `GIT_ASKPASS` script

### Requirement: Authenticated git clone

The system SHALL clone git repositories inside the workspace container using the workspace's git credentials, which are configured through the Settings hub.

#### Scenario: Clone with remote URL
- **WHEN** a project is added with a `remoteUrl` pointing to a git repository
- **THEN** the system runs `git clone <remoteUrl> <targetPath>` via `docker exec` inside the container
- **AND** authenticates using the `GIT_ASKPASS` script from the credentials file

#### Scenario: Clone into workspace root
- **WHEN** the target path is `.`
- **THEN** the system clones the repository contents directly into `/workspace`

### Requirement: Authenticated git pull

The system SHALL pull the latest changes for all enabled projects inside the container using the workspace's git credentials.

#### Scenario: Pull clean working tree
- **WHEN** a project has a clean working tree (no uncommitted changes)
- **THEN** the system runs `git pull --ff-only origin <branch>` via `docker exec` inside the container
- **AND** authenticates using the `GIT_ASKPASS` script from the credentials file
