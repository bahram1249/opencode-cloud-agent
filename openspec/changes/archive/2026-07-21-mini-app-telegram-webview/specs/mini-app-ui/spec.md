## ADDED Requirements

### Requirement: Hash-based screen routing

The Mini App SHALL use the URL hash fragment to determine which screen to display. Changing the hash SHALL render the corresponding screen without a full page load.

#### Scenario: Navigate to dashboard
- **WHEN** the URL hash is `#dashboard`
- **THEN** the app SHALL render the main dashboard showing the active workspace, active session status, and quick-action buttons

#### Scenario: Navigate to workspace settings
- **WHEN** the URL hash is `#workspace/:id`
- **THEN** the app SHALL render the workspace settings screen with sections for provider, model, projects, git, and sessions

#### Scenario: Navigate to project detail
- **WHEN** the URL hash is `#project/:id`
- **THEN** the app SHALL render the project detail screen with git status, diff, and action buttons

#### Scenario: Navigate to terminal
- **WHEN** the URL hash is `#session/:id`
- **THEN** the app SHALL initialize xterm.js and connect the WebSocket gateway

#### Scenario: Navigate to git operations
- **WHEN** the URL hash is `#git/:workspaceId`
- **THEN** the app SHALL render the git operations screen for the specified workspace

#### Scenario: Navigate to workspace list
- **WHEN** the URL hash is `#workspaces`
- **THEN** the app SHALL render the workspace list with status badges

### Requirement: Dashboard screen

The dashboard SHALL be the default screen and display the user's current context at a glance.

#### Scenario: Dashboard shows workspace and session
- **WHEN** the dashboard renders
- **THEN** it SHALL show the active workspace name, status badges (provider, model, project count, git)
- **AND** it SHALL show the active session status (publicId, running/stopped)
- **AND** it SHALL provide buttons to: start new session, view workspace settings, list sessions, list projects

### Requirement: Workspace settings screen

The workspace settings screen SHALL display all workspace configuration in a single form-like layout, mirroring the functionality of the bot's Settings hub.

#### Scenario: View workspace settings
- **WHEN** the workspace settings screen renders
- **THEN** it SHALL show: workspace name (editable), provider (dropdown + API key input), default model (selectable list), projects list with add/remove, git credential status with login/logout, session history

#### Scenario: Change provider
- **WHEN** user selects a provider from the dropdown
- **THEN** the app SHALL show an API key input field
- **WHEN** user enters the API key and submits
- **THEN** the app SHALL call the REST API to configure the provider

#### Scenario: Change model
- **WHEN** user clicks "Change Model"
- **THEN** the app SHALL fetch available models via the REST API
- **AND** display them in a selectable list (no pagination limit like the bot)
- **WHEN** user selects a model
- **THEN** the app SHALL call the REST API to set the default model

### Requirement: Project detail screen

The project detail screen SHALL display git status and provide actions for common git operations.

#### Scenario: View project detail
- **WHEN** the project detail screen renders
- **THEN** it SHALL show: project name, path, current branch, clean/dirty status, list of changed files
- **AND** provide buttons for: diff, stage, commit (with message input), push, pull, log, branch switch, create PR

#### Scenario: View full diff
- **WHEN** user clicks "View Diff"
- **THEN** the app SHALL fetch the full diff via the REST API
- **AND** display it without truncation

#### Scenario: Commit with message
- **WHEN** user clicks "Commit"
- **THEN** the app SHALL show a text input for the commit message
- **WHEN** user enters a message and submits
- **THEN** the app SHALL call the REST API to stage and commit

### Requirement: Terminal screen with xterm.js

The terminal screen SHALL use xterm.js to render the PTY output in full color with ANSI support, real-time updates, and physical keyboard input.

#### Scenario: Terminal renders
- **WHEN** the terminal screen loads
- **THEN** an xterm.js instance SHALL be initialized in a `<div>` element
- **AND** the app SHALL connect to the WebSocket gateway for the session
- **AND** replay the terminal buffer history
- **AND** pipe live output to xterm.js

#### Scenario: Physical keyboard input
- **WHEN** user types on the physical keyboard while the terminal is focused
- **THEN** the keystrokes SHALL be sent to the PTY via the WebSocket gateway
- **AND** Tab, Enter, Arrow keys, Ctrl+C, and Ctrl+D SHALL work as in a real terminal

#### Scenario: Terminal on-screen controls
- **WHEN** the terminal screen renders
- **THEN** on-screen buttons SHALL be available for: Tab, Enter, Up, Down, Ctrl+C (for mobile users without physical keyboard)

### Requirement: Git operations screen

The git operations screen SHALL provide a unified interface for git credential management and advanced git commands.

#### Scenario: Git credentials management
- **WHEN** the git operations screen renders
- **THEN** it SHALL show current credential status
- **AND** provide forms for login (username, token, remote URL) and logout

#### Scenario: Git credential test
- **WHEN** user clicks "Test Credentials"
- **THEN** the app SHALL call the REST API to re-validate credentials
- **AND** show the result

### Requirement: Session list screen

The session list screen SHALL display all sessions for the user with status and navigation.

#### Scenario: List all sessions
- **WHEN** the session list renders
- **THEN** it SHALL show all sessions across all workspaces
- **AND** each entry SHALL show: publicId, workspace name, running/stopped status, prompt preview
- **AND** provide buttons: view output, open terminal, cancel session

### Requirement: Navigation bar

The Mini App SHALL have a persistent navigation bar at the top or bottom for quick access to major sections.

#### Scenario: Navigation bar visible on all screens
- **WHEN** any screen is rendered
- **THEN** a navigation bar SHALL be visible with links to: Dashboard, Workspaces, Sessions, About
- **AND** the active screen SHALL be highlighted
