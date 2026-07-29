## ADDED Requirements

### Requirement: Auto-clone on project add
When a project is added with a `remoteUrl`, the system SHALL clone it immediately if the target path does not exist.

#### Scenario: Clone on add (path missing)
- **WHEN** a project is added with a `remoteUrl` and the target path does not exist in the container
- **THEN** the system clones the repository to the target path inside the container and stores the project record

#### Scenario: Path exists on add
- **WHEN** a project is added and the target path already exists in the container and is a valid git repository
- **THEN** the system stores the project record without cloning

### Requirement: Sync projects on session create
The system SHALL sync all enabled projects when a session is created (or when explicitly requested).

#### Scenario: Full sync before session
- **WHEN** a session is created
- **THEN** the system iterates all enabled projects and for each:
  - If the path is missing and a remote URL exists: clones the project
  - If the path exists with a clean working tree: pulls the latest changes
  - If the path exists with a dirty working tree: skips the pull and reports
  - If the path exists but is not a git repo: reports an error

#### Scenario: Sync result reporting
- **WHEN** a sync completes
- **THEN** the system returns a per-project result with action taken (clone/pull/skip/error), success status, and message

### Requirement: Sync on explicit request
The system SHALL allow a user to explicitly request project sync for a workspace.

#### Scenario: Manual sync
- **WHEN** a user sends `/ws <name> sync`
- **THEN** the system runs sync for all enabled projects in the workspace and reports results

### Requirement: Sync on container ensure
The system SHALL sync projects when a container is ensured (started or created), to keep projects current after container downtime.

#### Scenario: Sync after container start
- **WHEN** `ensureContainer()` starts a previously stopped container
- **THEN** the system syncs all enabled projects in that workspace (clone missing, pull clean repos)

#### Scenario: Idempotent sync on running container
- **WHEN** `ensureContainer()` finds the container already running
- **THEN** the system still syncs projects to ensure they are current
