## MODIFIED Requirements

### Requirement: Provider-agnostic git credential storage

The system SHALL store git credentials as `gitToken` and `gitUsername` on the `Workspace` model. These replace the GitHub-specific `githubToken` and `githubLogin` fields. Credentials SHALL be per-workspace — there is no tenant-level credential fallback.

#### Scenario: Store credentials on workspace
- **WHEN** a user sets git credentials via `/git login`
- **THEN** the workspace record SHALL store `gitToken` and `gitUsername`
- **AND** `GIT_TOKEN` and `GIT_USERNAME` SHALL be passed as `-e` env vars on subsequent `docker exec` calls for git operations
- **AND** the container SHALL NOT have `GIT_TOKEN` or `GIT_USERNAME` in its persistent environment

#### Scenario: Retrieve credentials for git operations
- **WHEN** a git operation (clone, pull, push) is performed
- **THEN** the system SHALL read `gitToken` and `gitUsername` from the active workspace
- **AND** pass them as `-e GIT_USERNAME=<username> -e GIT_TOKEN=<token>` on the `docker exec` command
- **AND** configure the git credential helper inline via `sh -c` before executing the git command

## REMOVED Requirements

### Requirement: Credential validation via git ls-remote

**Reason**: This requirement was never implemented. The actual implementation validates credentials via `git ls-remote` with credentials embedded in the URL, not via a credential helper. This requirement text was incorrect and is removed to avoid confusion.

**Migration**: No migration needed — the actual behavior (URL-embedded token validation via `git ls-remote`) remains unchanged.
