## ADDED Requirements

### Requirement: Mini App settings UI

The system SHALL provide a Mini App equivalent of the workspace settings hub. Instead of inline keyboard navigation with `editMessageText`, the Mini App SHALL render workspace settings as an HTML form with dropdowns, text inputs, buttons, and selectable lists. All settings operations SHALL use the REST API. The bot's inline-keyboard settings hub SHALL continue to work unchanged.

#### Scenario: Mini App shows workspace settings
- **WHEN** a user navigates to `#workspace/:id` in the Mini App
- **THEN** the app SHALL fetch workspace details via `GET /api/workspaces/:id`
- **AND** render a form-like layout showing: workspace name (editable input), provider (dropdown), API key (password input), default model (selectable list), projects (list with add/remove buttons), git credentials (status display with login/logout), session history (count and link)

#### Scenario: Configure provider in Mini App
- **WHEN** user selects a provider from the dropdown in the Mini App
- **THEN** an API key input field SHALL appear
- **WHEN** user enters the API key and clicks Save
- **THEN** the app SHALL call `PATCH /api/workspaces/:id` with the provider and API key
- **AND** the bot's Settings hub SHALL reflect the change on next view

#### Scenario: Model selection in Mini App
- **WHEN** user clicks "Change Model" in the Mini App
- **THEN** the app SHALL fetch available models via `GET /api/workspaces/:id/models`
- **AND** display them in a scrollable list (no pagination required, unlike the bot)
- **WHEN** user selects a model
- **THEN** the app SHALL call `PATCH /api/workspaces/:id` with the selected model

#### Scenario: Bot settings hub unchanged
- **WHEN** a user navigates the bot's inline-keyboard Settings hub
- **THEN** all existing scenarios (provider picker, model picker pagination, project management, git management, back navigation) SHALL continue to work exactly as specified
