## Purpose

A unified Settings screen for each workspace that serves as the single entry point for all workspace configuration — provider, model, projects, git credentials, and sessions. Every workspace has a Settings hub accessible from the workspace list or via `/setup`. The model picker supports pagination. Contextual help is available on every screen.

## Requirements

### Requirement: Settings hub screen

The system SHALL provide a Settings screen for each workspace that displays and manages all workspace configuration in a single view. The screen SHALL be the default detail view when tapping a workspace from the workspace list.

#### Scenario: View settings for active workspace
- **WHEN** user taps a workspace from the workspace list
- **THEN** the system SHALL display the Settings screen for that workspace via `editMessageText`
- **AND** the screen SHALL show labeled rows for: Provider (with current value and [Change]), Model (with current value and [Change]), Projects (with count and mini-status), Git (with login status and [Manage]), Sessions (with active session count)
- **AND** the screen SHALL show [✏️ Rename], [🗑️ Delete], [❓ Help], and [🔙 Workspace List] action buttons

#### Scenario: Settings navigates to sub-screens via edit
- **WHEN** user taps [Change] next to Provider on the Settings screen
- **THEN** the system SHALL edit the same message to show the provider picker sub-screen
- **WHEN** user taps a provider
- **THEN** the system SHALL edit the message to show an API key input prompt
- **WHEN** user sends the API key
- **THEN** the system SHALL configure the provider via `WorkspaceService.configureProvider()`
- **AND** edit the message back to the Settings screen with the new provider reflected

#### Scenario: Settings sub-screen has back navigation
- **WHEN** user is on any sub-screen (provider picker, model picker, project list, git management, session list)
- **THEN** the system SHALL show a [🔙 Settings] button
- **WHEN** user taps [🔙 Settings]
- **THEN** the system SHALL edit the message back to the Settings screen

### Requirement: Workspace list as dashboard

The workspace list SHALL show status badges per workspace row, indicating provider, model, project count, and git credential status at a glance.

#### Scenario: Workspace list with status badges
- **WHEN** user opens the workspace list
- **THEN** each workspace row SHALL display: name, active indicator, provider icon, model name, project count, and git status icon
- **AND** a workspace with no provider configured SHALL show ⚪ and "setup" text
- **AND** a workspace with no model selected SHALL show "—" for the model field

### Requirement: Paginated model picker

The system SHALL provide a paginated model picker that displays available models in pages and supports next/previous navigation. Pagination SHALL edit the same message in place.

#### Scenario: View model picker first page
- **WHEN** user taps [Change] next to Model on the Settings screen
- **THEN** the system SHALL fetch models via `WorkspaceService.listOpenCodeModels()`
- **AND** display up to 8 models per page as inline keyboard buttons
- **AND** show page counter: "Page 1/N"
- **AND** show [◀ Prev] (disabled on page 1), [Next ▶], [❓ Help], [🔙 Settings] buttons

#### Scenario: Navigate to next page
- **WHEN** user taps [Next ▶] on a model picker page
- **THEN** the system SHALL edit the message to show the next page of models
- **AND** update the page counter accordingly
- **AND** enable [◀ Prev] when past page 1

#### Scenario: Navigate to previous page
- **WHEN** user taps [◀ Prev] on a model picker page
- **THEN** the system SHALL edit the message to show the previous page of models
- **AND** update the page counter accordingly
- **AND** disable [◀ Prev] on page 1

#### Scenario: Select model from picker
- **WHEN** user taps a model button on any page
- **THEN** the system SHALL call `WorkspaceService.setDefaultModel()` with the selected model
- **AND** edit the message back to the Settings screen with the new model reflected

### Requirement: Contextual help on every screen

Every screen (workspace list, settings, provider picker, model picker, project list, git management, session list) SHALL display a [❓ Help] button. Tapping it SHALL send a new message with help text specific to that screen.

#### Scenario: View contextual help
- **WHEN** user taps [❓ Help] on the Settings screen
- **THEN** the system SHALL send a new message with help text explaining each section of the Settings screen and how to configure it

#### Scenario: Help from sub-screen
- **WHEN** user taps [❓ Help] on the model picker
- **THEN** the system SHALL send a new message with help text explaining how pagination works and how to select a model

### Requirement: Setup command opens Settings

The `/setup` command SHALL open the Settings screen for the active workspace instead of launching a separate wizard flow. If no workspace exists, it SHALL prompt the user to create one first.

#### Scenario: Setup with existing workspace
- **WHEN** user runs `/setup`
- **AND** the user has an active workspace
- **THEN** the system SHALL show the Settings screen for the active workspace via `editMessageText`

#### Scenario: Setup without any workspace
- **WHEN** user runs `/setup`
- **AND** the user has no workspaces
- **THEN** the system SHALL display a message prompting the user to create a workspace first with `/workspace create <name>`

### Requirement: Gateway commands route through Settings

Existing slash commands for workspace configuration SHALL remain functional as shortcuts that internally route through the same service methods as the Settings hub.

#### Scenario: /workspace provider sets API key
- **WHEN** user runs `/workspace provider opencode sk-xxx`
- **THEN** the system SHALL call `WorkspaceService.configureProvider()`
- **AND** confirm the update to the user
- **AND** the new provider SHALL be reflected when the user next opens the Settings screen

#### Scenario: /git login sets credentials
- **WHEN** user runs `/git login myuser ghp_xxx https://github.com/org/repo.git`
- **THEN** the system SHALL validate and store credentials via the existing `GitAuthService`
- **AND** the new status SHALL be reflected when the user next opens the Settings screen

### Requirement: Message editing support

The `NotificationService` SHALL support editing existing messages via `editMessageText` and `editMessageReplyMarkup` to enable in-place navigation without chat pollution.

#### Scenario: Edit message with new content
- **WHEN** a handler calls `notificationService.editMessage(chatId, messageId, text, keyboard)`
- **THEN** the system SHALL call `bot.telegram.editMessageText()` with the chat ID, message ID, new text, and inline keyboard
