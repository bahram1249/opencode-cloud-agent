## ADDED Requirements

### Requirement: REST API authentication

All REST API endpoints SHALL authenticate requests using the `X-Telegram-Init-Data` header. The server SHALL validate the HMAC-SHA256 signature of the initData value using the bot token, extract the user ID, and ensure a tenant exists before processing the request.

#### Scenario: Authenticated request
- **WHEN** a request is made to any REST API endpoint with a valid `X-Telegram-Init-Data` header
- **THEN** the server SHALL validate the initData
- **AND** process the request for the authenticated user

#### Scenario: Unauthenticated request
- **WHEN** a request is made without a valid `X-Telegram-Init-Data` header
- **THEN** the server SHALL return HTTP 401

### Requirement: Workspace REST API

The system SHALL expose REST endpoints for workspace CRUD operations that mirror the existing bot commands.

#### Scenario: List workspaces
- **WHEN** a GET request is made to `/api/workspaces`
- **THEN** the server SHALL return a JSON array of workspaces for the authenticated user

#### Scenario: Get workspace
- **WHEN** a GET request is made to `/api/workspaces/:id`
- **THEN** the server SHALL return the workspace details including projects and session count

#### Scenario: Create workspace
- **WHEN** a POST request is made to `/api/workspaces` with `{ "name": "..." }`
- **THEN** the server SHALL create a workspace directory, Docker container, and return the new workspace

#### Scenario: Update workspace
- **WHEN** a PATCH request is made to `/api/workspaces/:id` with fields (name, providerId, apiKey, model)
- **THEN** the server SHALL update the workspace and return the updated workspace

#### Scenario: Delete workspace
- **WHEN** a DELETE request is made to `/api/workspaces/:id`
- **THEN** the server SHALL remove the Docker container and delete the workspace

### Requirement: Project REST API

The system SHALL expose REST endpoints for project CRUD and management within a workspace.

#### Scenario: List projects
- **WHEN** a GET request is made to `/api/workspaces/:id/projects`
- **THEN** the server SHALL return a JSON array of projects in the workspace

#### Scenario: Add project
- **WHEN** a POST request is made to `/api/workspaces/:id/projects` with `{ "name": "...", "path": "...", "remoteUrl": "..." }`
- **THEN** the server SHALL add the project, clone if remote URL provided, and return the new project

#### Scenario: Update project
- **WHEN** a PATCH request is made to `/api/projects/:id` with fields (name, path, branch, remoteUrl, autoInstall)
- **THEN** the server SHALL update the project

#### Scenario: Delete project
- **WHEN** a DELETE request is made to `/api/projects/:id`
- **THEN** the server SHALL delete the project

### Requirement: Session REST API

The system SHALL expose REST endpoints for session listing, creation, and cancellation.

#### Scenario: List sessions
- **WHEN** a GET request is made to `/api/sessions`
- **THEN** the server SHALL return a JSON array of sessions for the authenticated user

#### Scenario: Create session
- **WHEN** a POST request is made to `/api/sessions` with `{ "prompt": "...", "workspaceName": "..." }`
- **THEN** the server SHALL create a session via `SessionService.createSession()` and return the session info

#### Scenario: Cancel session
- **WHEN** a POST request is made to `/api/sessions/:id/cancel`
- **THEN** the server SHALL kill the PTY and mark the session as finished

### Requirement: Git operation REST API

The system SHALL expose REST endpoints for git operations within a workspace.

#### Scenario: Git status
- **WHEN** a GET request is made to `/api/git/:workspaceId/status?projectId=:id`
- **THEN** the server SHALL return git status (branch, clean/dirty, files)

#### Scenario: Git diff
- **WHEN** a GET request is made to `/api/git/:workspaceId/diff?projectId=:id`
- **THEN** the server SHALL return the full git diff (no length limit)

#### Scenario: Git commit
- **WHEN** a POST request is made to `/api/git/:workspaceId/commit` with `{ "message": "...", "projectId": "..." }`
- **THEN** the server SHALL stage and commit all changes

#### Scenario: Git push
- **WHEN** a POST request is made to `/api/git/:workspaceId/push` with `{ "projectId": "..." }`
- **THEN** the server SHALL push to the remote

#### Scenario: Git pull
- **WHEN** a POST request is made to `/api/git/:workspaceId/pull` with `{ "projectId": "..." }`
- **THEN** the server SHALL pull from the remote

#### Scenario: Git log
- **WHEN** a GET request is made to `/api/git/:workspaceId/log?projectId=:id&limit=5`
- **THEN** the server SHALL return the recent commit log

#### Scenario: Git branch list
- **WHEN** a GET request is made to `/api/git/:workspaceId/branches?projectId=:id`
- **THEN** the server SHALL return the branch list with current branch marked

#### Scenario: Git branch switch
- **WHEN** a POST request is made to `/api/git/:workspaceId/checkout` with `{ "projectId": "...", "branch": "...", "onDirty": "stash|abort" }`
- **THEN** the server SHALL handle dirty state according to `onDirty` and switch branches

#### Scenario: Git create PR
- **WHEN** a POST request is made to `/api/git/:workspaceId/pr` with `{ "projectId": "..." }`
- **THEN** the server SHALL run `gh pr create --fill` and return the PR URL

### Requirement: Model listing REST API

The system SHALL expose a REST endpoint for listing available models.

#### Scenario: List models
- **WHEN** a GET request is made to `/api/workspaces/:id/models?providerId=:provider`
- **THEN** the server SHALL return a JSON array of available models

### Requirement: Git credentials REST API

The system SHALL expose REST endpoints for git credential management.

#### Scenario: Get credential status
- **WHEN** a GET request is made to `/api/git/:workspaceId/credentials`
- **THEN** the server SHALL return the credential status (set/unset, masked token, username)

#### Scenario: Set credentials
- **WHEN** a POST request is made to `/api/git/:workspaceId/credentials` with `{ "username": "...", "token": "...", "remoteUrl": "..." }`
- **THEN** the server SHALL validate the token via `git ls-remote` and store if valid

#### Scenario: Remove credentials
- **WHEN** a DELETE request is made to `/api/git/:workspaceId/credentials`
- **THEN** the server SHALL clear the stored credentials
