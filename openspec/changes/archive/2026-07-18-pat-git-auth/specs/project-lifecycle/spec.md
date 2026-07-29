## MODIFIED Requirements

### Requirement: Git credential check before project add with remote

The system SHALL check if the workspace has git credentials configured before allowing a project add with a remote URL. If no credentials are set, the system SHALL offer to set them via `/git login`.

#### Scenario: Add project with remote URL — no credentials
- **WHEN** user runs `/project add frontend . https://github.com/org/repo.git`
- **AND** the workspace has no `gitToken` set
- **THEN** the system SHALL warn the user
- **AND** SHALL display a message:
  ```
  ⚠️ No git credentials configured.
  /git login <username> <token> <remote-url>
  Example: /git login myuser ghp_abc123 https://github.com/org/repo.git
  ```
- **AND** SHALL NOT proceed with the clone

#### Scenario: Add project with remote URL — has credentials
- **WHEN** user runs `/project add frontend . https://github.com/org/repo.git`
- **AND** the workspace has `gitToken` set
- **THEN** the system SHALL clone the repository using the workspace's git credentials

### Requirement: Pull request creation

The system SHALL support creating pull requests via the `gh` CLI inside the container. The `gh` CLI reads `GITHUB_TOKEN` from the environment, which SHALL be set as a backward-compatibility alias for `GIT_TOKEN`.

#### Scenario: PR creation with git credentials
- **WHEN** user runs `/git pr`
- **AND** the workspace has `gitToken` set
- **THEN** the system SHALL run `gh pr create --fill` inside the container
- **AND** `gh` SHALL authenticate via the `GITHUB_TOKEN` environment variable
- **AND** SHALL return the PR URL

#### Scenario: PR creation without credentials
- **WHEN** user runs `/git pr`
- **AND** no `gitToken` is set on the workspace
- **THEN** the system SHALL display:
  ```
  ❌ No git credentials configured.
  /git login <username> <token> <remote-url>
  ```
