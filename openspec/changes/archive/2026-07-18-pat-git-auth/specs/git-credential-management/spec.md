## ADDED Requirements

### Requirement: Provider-agnostic git credential storage

The system SHALL store git credentials as `gitToken` and `gitUsername` on the `Workspace` model. These replace the GitHub-specific `githubToken` and `githubLogin` fields. Credentials SHALL be per-workspace — there is no tenant-level credential fallback.

#### Scenario: Store credentials on workspace
- **WHEN** a user sets git credentials via `/git login`
- **THEN** the workspace record SHALL store `gitToken` and `gitUsername`
- **AND** `GIT_TOKEN` and `GIT_USERNAME` SHALL be set in the container environment

#### Scenario: Retrieve credentials for git operations
- **WHEN** a git operation (clone, pull, push) is performed
- **THEN** the system SHALL read `gitToken` and `gitUsername` from the active workspace
- **AND** configure the git credential helper with these values

### Requirement: Credential validation via git ls-remote

The system SHALL validate credentials by running `git ls-remote` against a remote URL with the provided credentials embedded in the URL. This works with any git-over-HTTPS provider (GitHub, GitLab, Bitbucket, Gitea, self-hosted).

#### Scenario: Successful validation
- **WHEN** user runs `/git login myuser ghp_abc123 https://github.com/org/repo.git`
- **THEN** the system SHALL execute `git ls-remote https://myuser:ghp_abc123@github.com/org/repo.git`
- **AND** if the exit code is 0, SHALL store the credentials
- **AND** SHALL display a SUCCESS message with the masked token and next steps

#### Scenario: Validation with no remote URL
- **WHEN** user runs `/git login myuser ghp_abc123` with no URL
- **AND** the workspace has an existing project with a remote URL
- **THEN** the system SHALL use that project's remote URL for validation
- **AND** if no project exists, SHALL store without validation and notify the user

#### Scenario: Authentication failure during validation
- **WHEN** `git ls-remote` exits with code 128
- **THEN** the system SHALL NOT store the credentials
- **AND** SHALL display an ERROR message with the failure reason and a corrected example command

#### Scenario: Network error during validation
- **WHEN** `git ls-remote` fails with a network error (DNS, timeout, connection refused)
- **THEN** the system SHALL display an ERROR message distinguishing "host unreachable" from "authentication failed"
- **AND** SHALL suggest checking the remote URL

### Requirement: Six UX states with inline examples

The system SHALL present git credential information in six distinct states, each with an icon, status description, actionable next steps, and a concrete example the user can copy-paste.

#### Scenario: Empty state
- **WHEN** no git credentials are set on the workspace
- **THEN** the system SHALL display: "🔑 Git Credentials — Not configured" with instructions
- **AND** SHALL include a link to common provider token pages (GitHub, GitLab, Bitbucket)
- **AND** SHALL include an example: `/git login <username> <token> <remote-url>`

#### Scenario: Loading state
- **WHEN** a credential validation is in progress
- **THEN** the system SHALL display: "⏳ Validating git credentials..."
- **AND** SHALL show the remote URL being tested (with token masked)

#### Scenario: Success state
- **WHEN** credentials are validated and stored
- **THEN** the system SHALL display: "✅ Git credentials verified!"
- **AND** SHALL show the username, masked token, remote URL, and number of refs found
- **AND** SHALL show next-step examples: `/git status`, `/git pull`

#### Scenario: Error state
- **WHEN** credential validation fails
- **THEN** the system SHALL display: "❌ Authentication failed"
- **AND** SHALL list possible causes (expired token, wrong scope, incorrect URL)
- **AND** SHALL include a corrected example command ready to modify

#### Scenario: Expired state (auto-detected)
- **WHEN** a git operation (push, pull) fails with 401 or 403
- **THEN** the system SHALL clear the workspace's `gitToken` and `gitUsername`
- **AND** SHALL notify the user: "❌ Git push failed — credentials rejected by server"
- **AND** SHALL include a re-login example: `/git login <username> <new-token> <url>`

#### Scenario: Status state
- **WHEN** user runs `/git status`
- **THEN** the system SHALL display the current credential status
- **AND** SHALL show: workspace name, username, masked token, remote URL, last verified time
- **AND** SHALL offer: `/git test` to re-validate, `/git logout` to remove

### Requirement: Token masking in display

The system SHALL never display the full token in any message. Only the first 4 and last 4 characters SHALL be shown, joined by `****`.

#### Scenario: Display masked token
- **WHEN** displaying credential status
- **THEN** token `ghp_abcdef12345678` SHALL appear as `ghp_****5678`

### Requirement: Credential removal

The system SHALL allow users to remove git credentials from a workspace.

#### Scenario: Manual removal
- **WHEN** user runs `/git logout`
- **THEN** the system SHALL clear `gitToken` and `gitUsername` on the active workspace
- **AND** SHALL display: "✅ Git credentials removed"
- **AND** SHALL include an example to set new credentials

#### Scenario: Auto-clear on git auth failure
- **WHEN** a git push, pull, or clone returns a 401 or 403 HTTP status
- **THEN** the system SHALL automatically clear the workspace's `gitToken` and `gitUsername`
- **AND** SHALL notify the user with the EXPIRED state message
