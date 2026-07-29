## Why

The Telegram bot's help text and user-facing messages contain significant discrepancies from actual system behavior — two functional bugs exist (`/git status` shows wrong information, setup wizard mishandles credential input), the `/help` text omits 15+ available commands/subcommands, and several command descriptions are misleading. This erodes user trust, causes confusion, and wastes time on trial-and-error.

## What Changes

- **Fix `/git status`**: Re-order handler so `status` routes to repo-status (branch, changes) instead of credential status. Move credential status to `/git credential-status` or similar.
- **Fix setup wizard git step**: Correctly parse `/git login <user> <token> <url>` format when entered during setup flow.
- **Update `/help` text**: Add missing commands (`/setup`, `/opencode`, `/project branches`, `/project switch`, `/project install`, `/project provider`, `/project model`, `/workspace provider`, `/workspace models`, `/workspace model`, `/workspace sync`, `/workspace rename`, `/workspace delete`, `/workspace github-token`)
- **Update `/opencode` description**: Align with actual behavior (alias for `/send`).
- **Fix `help.txt`**: Rename or clarify that it's a Docker build hint, not Telegram help.
- **Standardize command descriptions** across bot command menu (`setMyCommands`), `/help` text, and inline guidance messages.

## Capabilities

### New Capabilities
*(None — this change fixes existing behavior and documentation, no new capabilities)*

### Modified Capabilities
*(No existing specs to modify — this is the first change for this project)*

## Impact

- **`src/modules/telegram/telegram-command.handler.ts`**: Fix handler routing for `/git status`, update `/help` text, fix setup wizard credential parsing
- **`src/modules/telegram/telegram-bot.service.ts`**: Update `/opencode` command description
- **`src/modules/stream/stream.service.ts`**: Possibly update stream keyboard tooltip/commands
- **`help.txt`**: Rename or add clarifying header
- No API or database schema changes
