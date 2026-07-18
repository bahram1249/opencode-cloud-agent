## Purpose

Project lifecycle management within a workspace: relative path model, path-based git clone, branch management with dirty-state handling, pull request creation via `gh` CLI, and automatic dependency installation.

## Requirements

### Requirement: Relative project path model

Each project SHALL store a `path` field that is relative to the workspace root. A value of `.` SHALL resolve to `/workspace` inside the container. Any other value like `frontend` SHALL resolve to `/workspace/frontend`. The system SHALL NOT use the remote repository name to determine the clone target directory — the `path` field is the sole decider.

#### Scenario: Project with dot path
- **WHEN** user creates a project with `path: "."` and `remoteUrl: "https://github.com/org/repo.git"`
- **THEN** the project SHALL be cloned into `/workspace` inside the container (i.e., `git clone <url> .`)

#### Scenario: Project with named path
- **WHEN** user creates a project with `path: "frontend"` and `remoteUrl: "https://github.com/org/awesome-ui.git"`
- **THEN** the project SHALL be cloned into `/workspace/frontend` (i.e., `git clone <url> frontend`)

#### Scenario: Remote name differs from path
- **WHEN** `path: "api"` and `remoteUrl: "https://github.com/org/some-repo.git"`
- **THEN** the clone target SHALL be `/workspace/api`, regardless of the remote name `some-repo`

### Requirement: GitHub auth check before project add with remote

When adding a project with a remote URL, the system SHALL check if the workspace has a GitHub token configured. If no token is found, the bot SHALL warn the user and offer to initiate GitHub login.

#### Scenario: Block project add without GitHub token
- **WHEN** user runs `/project add frontend . https://github.com/org/repo.git`
- **AND** the workspace has no `githubToken`
- **THEN** the bot SHALL display a warning: "This workspace has no GitHub token configured"
- **AND** offer a button to initiate GitHub login

### Requirement: Path-based git clone

When a project is added, the system SHALL clone the remote repository into `<workspaceDir>/<path>` inside the container. The clone SHALL use the workspace's `githubToken` for authentication.

#### Scenario: Clone with path
- **WHEN** user runs `/project add api --path api --remote https://github.com/org/backend.git`
- **THEN** the system SHALL execute `git clone https://github.com/org/backend.git /workspace/api` inside the container
- **AND** use the workspace's `githubToken` for authentication

#### Scenario: Clone at workspace root
- **WHEN** user runs `/project add monolith --path . --remote https://github.com/org/mono.git`
- **THEN** the system SHALL execute `git clone https://github.com/org/mono.git .` inside the workspace root directory

### Requirement: Default branch detection on first clone

On initial clone, the system SHALL use the remote's default HEAD branch. The project SHALL NOT hardcode a default branch like `main`. The `branch` field in the database is a tracking hint for the current working branch, not a clone-time parameter.

#### Scenario: First clone uses remote default
- **WHEN** user adds a project and the remote's default branch is `main`
- **THEN** after clone, the project SHALL be on `main` (the remote default)

#### Scenario: Remote default is not main
- **WHEN** the remote's default branch is `develop`
- **THEN** after clone, the project SHALL be on `develop`

### Requirement: Branch listing

The bot SHALL support listing all branches for a project. The command `/project branches <project-name>` SHALL show local and remote branches with an indicator for the current branch.

#### Scenario: List branches
- **WHEN** user runs `/project branches frontend`
- **THEN** the bot SHALL display a list of branches with the current branch marked (e.g., `* main`, `feature/new-auth`, `origin/develop`)

### Requirement: Branch switching with dirty-state handling

The bot SHALL support switching branches via `/project switch <project-name> <branch-name>`. If the working tree is clean, it SHALL check out the branch. If dirty, the bot SHALL present the user with options: `[Stash]` `[Commit]` `[Abort]`.

- **Stash**: Runs `git stash push -m "auto-stash before branch switch"` then checks out the target branch.
- **Commit**: Prompts the user for a commit message, then runs `git commit -am "<message>"` and checks out the target branch.
- **Abort**: Cancels the operation with no side effects.

#### Scenario: Clean branch switch
- **WHEN** user runs `/project switch frontend develop`
- **AND** the working tree is clean
- **THEN** the system SHALL execute `git checkout develop`

#### Scenario: Dirty branch switch with stash
- **WHEN** user runs `/project switch frontend develop`
- **AND** the working tree has uncommitted changes
- **THEN** the bot SHALL show inline buttons: [Stash] [Commit] [Abort]
- **WHEN** user clicks [Stash]
- **THEN** the system SHALL run `git stash push -m "auto-stash before branch switch"`
- **AND** then `git checkout develop`

#### Scenario: Dirty branch switch with commit
- **WHEN** user clicks [Commit] from the dirty-state prompt
- **THEN** the bot SHALL ask for a commit message
- **WHEN** user provides a commit message
- **THEN** the system SHALL run `git commit -am "<message>"`
- **AND** then `git checkout develop`

#### Scenario: Dirty branch switch aborted
- **WHEN** user clicks [Abort] from the dirty-state prompt
- **THEN** the operation SHALL be cancelled
- **AND** the working tree SHALL remain unchanged

### Requirement: Pull request creation

The bot SHALL support creating a pull request via `/git pr <project-name>`. The system SHALL use the `gh` CLI inside the container to create the PR. `gh` SHALL be pre-configured with `GITHUB_TOKEN` from the workspace credentials.

#### Scenario: Create PR from current branch
- **WHEN** user runs `/git pr frontend`
- **AND** `gh` is available in the container
- **AND** the workspace has a valid `githubToken`
- **THEN** the system SHALL execute `gh pr create --fill` in the project directory
- **AND** return the PR URL to the user

#### Scenario: PR creation fails without token
- **WHEN** user runs `/git pr frontend`
- **AND** the workspace has no `githubToken`
- **THEN** the bot SHALL display an error: "GitHub token not configured for this workspace. Run /workspace github-login first."

### Requirement: Automatic dependency installation

After a project is cloned or pulled, the system SHALL detect the project type and install dependencies automatically. Detection SHALL check for known files in order and run the first match:

| File | Command |
|---|---|
| `package.json` | `npm install` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `pyproject.toml` | `pip install -e .` |
| `Cargo.toml` | `cargo build` |
| `go.mod` | `go mod download` |
| `Gemfile` | `bundle install` |
| `composer.json` | `composer install` |

If installation fails, the system SHALL report the error to the user but SHALL NOT roll back the clone/pull. The user MAY retry dependency installation later via `/project install <project-name>`.

#### Scenario: Auto-install npm dependencies after clone
- **WHEN** a project is cloned into `/workspace/frontend`
- **AND** `/workspace/frontend/package.json` exists
- **THEN** the system SHALL run `npm install` inside `/workspace/frontend`
- **AND** report success or failure to the user

#### Scenario: Auto-install Python dependencies after clone
- **WHEN** a project is cloned into `/workspace/backend`
- **AND** `/workspace/backend/requirements.txt` exists
- **AND** no `package.json` exists
- **THEN** the system SHALL run `pip install -r requirements.txt` inside `/workspace/backend`

#### Scenario: No recognized project type
- **WHEN** a project is cloned
- **AND** none of the recognized dependency files exist
- **THEN** the system SHALL skip dependency installation
- **AND** notify the user that no dependencies were detected

#### Scenario: Dependency install fails
- **WHEN** `npm install` fails (non-zero exit)
- **THEN** the system SHALL report the error to the user
- **AND** the user SHALL still have access to the cloned repository

#### Scenario: Manual dependency install
- **WHEN** user runs `/project install frontend`
- **THEN** the system SHALL re-run dependency detection and installation for that project

### Requirement: Dependency install configuration

Each project MAY have configuration for dependency installation. The configuration SHALL support:
- `autoInstall`: boolean (default `true`) — whether to auto-install after clone/pull
- `installCommand`: string (optional) — override the detected command (e.g., `npm install --force` or `npm ci`)

#### Scenario: Override install command
- **WHEN** a project has `installCommand: "npm install --force"`
- **THEN** the system SHALL run `npm install --force` instead of `npm install`

#### Scenario: Disable auto-install
- **WHEN** a project has `autoInstall: false`
- **THEN** the system SHALL NOT run dependency installation after clone or pull
