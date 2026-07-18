## ADDED Requirements

### Requirement: Authenticated git clone

The system SHALL clone git repositories inside the workspace container using the workspace's GitHub credentials.

#### Scenario: Clone with remote URL
- **WHEN** a project is added with a `remoteUrl` pointing to a GitHub repository
- **THEN** the system runs `git clone <remoteUrl> <targetPath>` via `docker exec` inside the container, authenticated as the workspace's GitHub user

#### Scenario: Clone into workspace root
- **WHEN** the target path is `.`
- **THEN** the system clones the repository contents directly into `/workspace`

### Requirement: Authenticated git pull

The system SHALL pull the latest changes for all enabled projects inside the container using the workspace's GitHub credentials.

#### Scenario: Pull clean working tree
- **WHEN** a project has a clean working tree (no uncommitted changes)
- **THEN** the system runs `git pull --ff-only origin <branch>` via `docker exec` inside the container

#### Scenario: Skip pull on dirty working tree
- **WHEN** a project has uncommitted changes
- **THEN** the system skips the pull and reports that local changes prevented automatic pull

### Requirement: Authenticated git commit and push

The system SHALL allow committing and pushing changes via the container, authenticated as the workspace.

#### Scenario: Stage and commit
- **WHEN** a user requests a git commit with paths and a message
- **THEN** the system runs `git add <pathspec>` and `git commit -m <message>` via `docker exec` inside the container

#### Scenario: Push to remote
- **WHEN** a user requests a git push to a remote branch
- **THEN** the system runs `git push -u <remote> <branch>` via `docker exec` inside the container

### Requirement: Git status and diff

The system SHALL report git status and diff information from inside the container.

#### Scenario: Check git status
- **WHEN** a user requests git status for a project
- **THEN** the system runs `git status --porcelain` and `git rev-parse --abbrev-ref HEAD` via `docker exec` and returns branch name, file changes, ahead/behind counts

#### Scenario: View git diff
- **WHEN** a user requests git diff for a project (optionally filtered by pathspec)
- **THEN** the system runs `git diff --no-color [-- <pathspec>]` via `docker exec` and returns the diff output

### Requirement: Container path conversion

The system SHALL convert host-side project paths to container-relative paths (under `/workspace`) for git operations.

#### Scenario: Host path to container path
- **WHEN** a git operation is requested with a host-side `gitPath` of `/data/workspaces/tenant-1/my-ws/my-project`
- **THEN** the system converts it to `my-project` (relative to `/workspace`) for the `docker exec` working directory

#### Scenario: Project gitPath at workspace root
- **WHEN** a project's `gitPath` equals the workspace's auto-assigned host path
- **THEN** the system uses `/workspace` as the `docker exec` working directory

### Requirement: Branch management

The system SHALL support listing, switching, and creating branches.

#### Scenario: List branches
- **WHEN** a user requests branch listing for a project
- **THEN** the system runs `git branch -a` via `docker exec` and returns local and remote branches with the current branch marked

#### Scenario: Switch branches
- **WHEN** a user requests a branch switch
- **THEN** the system runs `git checkout <branch>` via `docker exec` inside the container

### Requirement: Git log

The system SHALL support viewing git log for a project.

#### Scenario: View git log
- **WHEN** a user requests git log for a project
- **THEN** the system runs `git log --oneline -<limit>` via `docker exec` and returns the commit history
