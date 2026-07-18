## MODIFIED Requirements

### Requirement: Authenticated git clone

The system SHALL clone repositories using the workspace's git credentials. The credential helper configured at container start handles authentication. References to GitHub-specific credentials SHALL use generic git credential names.

#### Scenario: Clone with remote URL
- **WHEN** user adds a project with a remote URL
- **AND** the workspace has git credentials configured
- **THEN** the system SHALL clone the repository authenticated as the workspace's configured git user

### Requirement: Authenticated git commit and push

Git commit and push operations SHALL use the workspace's git credentials via the configured credential helper.

#### Scenario: Commit and push
- **WHEN** user runs `/git commit` and `/git push`
- **THEN** the system SHALL commit and push using the workspace's git credentials
- **AND** git SHALL authenticate via the credential helper configured with `$GIT_USERNAME` and `$GIT_TOKEN`
