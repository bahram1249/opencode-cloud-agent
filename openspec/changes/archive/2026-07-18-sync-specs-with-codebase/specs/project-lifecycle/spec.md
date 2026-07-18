## ADDED Requirements

### Requirement: Git status reporting

The system SHALL support showing git status for a project inside the container.

#### Scenario: Check git status
- **WHEN** user requests git status for a project
- **THEN** the system runs `git status --porcelain` and `git rev-parse --abbrev-ref HEAD` via `docker exec` and returns branch name, file changes, ahead/behind counts

### Requirement: Git diff viewing

The system SHALL support viewing git diff for a project inside the container.

#### Scenario: View git diff
- **WHEN** user requests git diff for a project (optionally filtered by pathspec)
- **THEN** the system runs `git diff --no-color [-- <pathspec>]` via `docker exec` and returns the diff output

### Requirement: Git log viewing

The system SHALL support viewing git commit log for a project inside the container.

#### Scenario: View git log
- **WHEN** user requests git log for a project
- **THEN** the system runs `git log --oneline -<limit>` via `docker exec` and returns the commit history

### Requirement: Dependency install configuration per project

Each project MAY have configuration for dependency installation. The configuration SHALL support:
- `autoInstall`: boolean (default `true`) — whether to auto-install after clone/pull
- `installCommand`: string (optional) — override the detected command

#### Scenario: Override install command
- **WHEN** a project has `installCommand: "npm install --force"`
- **THEN** the system runs `npm install --force` instead of `npm install`

#### Scenario: Disable auto-install
- **WHEN** a project has `autoInstall: false`
- **THEN** the system SHALL NOT run dependency installation after clone or pull
