## Purpose

Decompose the monolithic `WorkspaceService` into focused, single-responsibility services while maintaining full backward compatibility through a thin facade.

## Requirements

### Requirement: Decompose WorkspaceService
The system SHALL decompose the existing `WorkspaceService` into the following focused services, with a thin facade maintaining backward compatibility:

- `WorkspaceCrudService` — workspace and tenant CRUD operations
- `ProjectService` — project CRUD and query operations
- `WorkspaceGitSyncService` — git clone, pull, validate repo, sync projects flow
- `DependencyInstallService` — project type detection and dependency installation

#### Scenario: WorkspaceCrudService handles create/read/update/delete
- **WHEN** a workspace is created, read, updated, or deleted
- **THEN** `WorkspaceCrudService` SHALL handle the database operations
- **AND** the service SHALL include tenant ownership and active-workspace management

#### Scenario: ProjectService handles project operations
- **WHEN** a project is added, updated, deleted, or queried
- **THEN** `ProjectService` SHALL handle the database operations
- **AND** SHALL handle path resolution (host path to container path)

#### Scenario: WorkspaceGitSyncService handles git sync
- **WHEN** `syncProjects()` is called
- **THEN** `WorkspaceGitSyncService` SHALL iterate enabled projects, clone missing ones, pull existing ones
- **AND** SHALL handle credential retrieval and injection for git operations

#### Scenario: DependencyInstallService handles installs
- **WHEN** `installProjectDependencies()` is called
- **THEN** `DependencyInstallService` SHALL detect the project type and run the appropriate install command

#### Scenario: Backward-compatible facade
- **WHEN** existing code imports `WorkspaceService` and calls methods like `addProject()`, `syncProjects()`, `create()`
- **THEN** the `WorkspaceService` facade SHALL delegate to the appropriate new service
- **AND** SHALL NOT require changes to any existing callers

### Requirement: Dual-interface unaffected by refactor
Both the Telegram Bot handlers and Mini App REST controllers SHALL continue to work identically after the refactor, as they all go through the `WorkspaceService` facade.

#### Scenario: Bot handlers work after refactor
- **WHEN** Telegram Bot handlers call `workspaceService.addProject()`, `workspaceService.syncProjects()`, etc.
- **THEN** the facade SHALL delegate to the new services transparently
- **AND** the bot output SHALL be identical to before the refactor

#### Scenario: REST API works after refactor
- **WHEN** Mini App controllers call `workspaceService.getProjects()`, `workspaceService.installProjectDependencies()`, etc.
- **THEN** the facade SHALL delegate to the new services transparently
- **AND** the API responses SHALL be identical to before the refactor
