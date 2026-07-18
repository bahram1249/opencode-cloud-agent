## ADDED Requirements

### Requirement: GitHub OAuth login
The system SHALL allow a tenant to authenticate via GitHub OAuth to obtain a personal access token for git operations.

#### Scenario: Initiate GitHub login
- **WHEN** a tenant sends `/login github` via Telegram
- **THEN** the system generates a GitHub OAuth URL with appropriate scopes (repo, user) and responds with the authorization URL

#### Scenario: GitHub OAuth callback
- **WHEN** GitHub redirects to the callback endpoint with an authorization code
- **THEN** the system exchanges the code for an access token, fetches the GitHub username, and stores `githubToken` and `githubLogin` on the Tenant record

#### Scenario: Successful login confirmation
- **WHEN** the OAuth flow completes successfully
- **THEN** the system notifies the tenant via Telegram with "✅ Logged into GitHub as <username>"

#### Scenario: OAuth flow failure
- **WHEN** the OAuth callback receives an error parameter
- **THEN** the system logs the error and notifies the tenant via Telegram with "❌ GitHub login failed: <error>"

### Requirement: Token revocation
The system SHALL allow a tenant to revoke their GitHub token.

#### Scenario: Manual logout
- **WHEN** a tenant sends `/logout github` via Telegram
- **THEN** the system clears `githubToken`, `githubLogin`, and `githubAvatar` on the Tenant record and notifies the tenant

#### Scenario: Token invalidated by GitHub
- **WHEN** a git operation fails with a 401/403 response
- **THEN** the system clears the tenant's `githubToken` and notifies the tenant to re-authenticate via `/login github`

### Requirement: Token scope validation
The system SHOULD validate that the stored token has the `repo` scope on login and warn the tenant if scopes are insufficient.

#### Scenario: Insufficient scope warning
- **WHEN** the OAuth callback returns a token without the `repo` scope
- **THEN** the system stores the token but warns the tenant that push operations may fail
