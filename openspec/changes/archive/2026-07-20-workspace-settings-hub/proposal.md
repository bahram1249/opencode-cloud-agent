## Why

The Telegram bot's workspace management is scattered across 10+ commands, a one-time setup wizard, and multiple entry points for provider, model, and git configuration. Users must know arcane slash commands to do simple things like changing an API key or picking a model. There is no single place to see and manage everything about a workspace — its provider, model, projects, git status, and active sessions. This makes the bot feel amateurish and hard to use.

## What Changes

- **New unified Settings screen** replacing the workspace details card (`sendWorkspaceDetails`). Every workspace has a single Settings hub showing provider, model, projects (with compact status), git credentials, and active sessions — each with a [Manage] button to drill in.
- **Workspace list becomes a dashboard** with per-row provider/model/project count badges, showing setup completeness at a glance.
- **Paginated model picker** with next/prev and page counter, editing the same message in place.
- **Contextual help button** on every screen — tap ❓ to see help specific to that screen.
- **Setup wizard merged into Settings** — `/setup` opens Settings for the active workspace instead of a separate 4-step wizard.
- **Model configuration consolidated** to workspace level only — remove per-project `provider`, `model`, `models` commands. Workspace model is the single source of truth.
- **Settings available from both inline navigation and slash commands** (`/workspace settings`, `/setup`).
- **Message editing** added to `NotificationService` so pagination and settings navigation edit the same message in place.

## Capabilities

### New Capabilities
- `workspace-settings-hub`: Unified Settings screen for each workspace — provider, model, projects, git, sessions — with drill-down sub-screens, contextual help, and paginated model picker.

### Modified Capabilities
- `workspace-credentials`: Provider API key and git credential management moves from separate commands (`/workspace provider`, `/git login`) into the Settings hub as sub-screens. The `interactive setup wizard` requirement replaced by Settings hub as the entry point.
- `credential-injection`: Credential source shifts from direct `Workspace` model fields to the Settings hub's configuration store. Per-exec injection mechanism unchanged.
- `git-credential-management`: `/git login` and `/git logout` become wrappers around the Settings hub. UX states updated to reference hub.
- `project-lifecycle`: Per-project provider/model settings removed. Credential check references the hub. `Git credential check before project add` requirement updated to reference hub status.
- `git-operations`: Credential read path shifts from workspace record to hub configuration store.

## Impact

- **`NotificationService`**: New `editMessageText()` method for in-place message editing.
- **`telegram-menus.ts`**: `sendWorkspaceDetails()` replaced by full Settings screen builder. `showWorkspaceMenu()` enriched with status badges. New sub-screen builders for provider picker, project management, git management, session list.
- **`telegram-workspace.handler.ts`**: `showModelPicker()` gets pagination. New callback handlers for settings sub-navigation. Removed per-project model handling.
- **`telegram-setup.handler.ts`**: Wizard state machine removed. `/setup` command re-routed to Settings screen.
- **`telegram-command.handler.ts`**: New callback namespace `setting:` for settings sub-navigation. `messageId` threaded through callbacks for edit support.
- **`telegram-workspace.handler.ts`**: `modelCallbackStore` extended with page context.
- **`workspace.service.ts`**: May need settings-store abstraction layer.
- **`WorkspaceProject` model**: Remove `provider` field (no longer per-project).
- **Help system**: Single static `HELP_TEXT` replaced by contextual help map.
