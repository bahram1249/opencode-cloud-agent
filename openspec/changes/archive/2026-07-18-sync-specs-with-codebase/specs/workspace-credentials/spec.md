## ADDED Requirements

### Requirement: Git credential helper configuration

The system SHALL configure git's credential helper inside the workspace container to authenticate git operations using the workspace's `GITHUB_TOKEN`.

#### Scenario: Configure git auth on container start
- **WHEN** a container starts (or `ensureContainer()` runs)
- **THEN** the system runs `git config --global credential.helper` inside the container to use the workspace's `GITHUB_USER` and `GITHUB_TOKEN`

### Requirement: Credential isolation between workspaces

Credentials stored on one workspace SHALL NOT be accessible to another workspace's container. Each container SHALL only receive environment variables from its own workspace record.

#### Scenario: Two workspaces with different credentials
- **WHEN** Workspace A has `apiKey: "sk-A"` and Workspace B has `apiKey: "sk-B"`
- **THEN** Workspace A's container SHALL NOT have `sk-B` in its environment
- **AND** Workspace B's container SHALL NOT have `sk-A` in its environment

## MODIFIED Requirements

### Requirement: Per-workspace GitHub token storage

Each workspace SHALL store its own `githubToken` and `githubLogin`. The `Workspace` model SHALL include both fields. When a container is started, `GITHUB_TOKEN` and `GITHUB_USER` env vars SHALL be set from the workspace record, not from the `Tenant` model.

For backward compatibility during migration, if a workspace has no `githubToken` but the parent `Tenant` does, the system MAY fall back to the Tenant-level token.

#### Scenario: Container receives per-workspace GitHub token
- **WHEN** a workspace has `githubToken: "ghp_abc"` and `githubLogin: "user1"`
- **AND** `ensureContainer()` is called
- **THEN** the container SHALL have `GITHUB_TOKEN=ghp_abc` and `GITHUB_USER=user1` in its environment

#### Scenario: Fallback to tenant token
- **WHEN** a workspace has no `githubToken`
- **BUT** the parent tenant has `githubToken: "ghp_xyz"`
- **THEN** the container SHALL receive `GITHUB_TOKEN=ghp_xyz` from the tenant
