## Context

The Telegram bot has two layers of user-facing text: (1) the `/help` command output and bot command descriptions registered via `setMyCommands`, and (2) inline guidance sent during workflows (setup, project management, git operations). The exploration phase found that neither layer accurately reflects the current codebase — `/git status` routes to credential info instead of repo status, the setup wizard's git step misparses user input, and the `/help` text omits 15+ available subcommands.

## Goals / Non-Goals

**Goals:**
- Fix the `/git status` handler routing so it shows repo status (not credentials)
- Fix the setup wizard git credential parsing to handle `/git login <user> <token> <url>` format
- Update `/help` text to include all available commands and subcommands
- Update bot command descriptions (`setMyCommands`) to match actual behavior
- Remove or rename `help.txt` to avoid confusion

**Non-Goals:**
- No new user-facing features or capabilities
- No database schema changes
- No new commands — this is about fixing existing ones
- No changes to the streaming output format or session flow

## Decisions

### D1: `/git status` routing — credential check should be opt-in, not the default

**Decision**: Move credential status display to `/git credential-status` (or keep it accessible via `/git status --creds`). The handler switch should explicitly match `credential-status` for credentials, leaving `status` for repo status. This makes the routing match user expectations.

**Alternatives considered**:
- Keep routing but change help text to say `/git status` shows credentials — rejected because this contradicts the rest of the Git Operations section and `git status` is universally understood as repo status
- Rename the credential command to `/git whoami` — creative but unnecessarily different from standard git conventions

### D2: Setup wizard input parsing — strip `/git login ` prefix

**Decision**: In the setup wizard's text input handler at `telegram-command.handler.ts:125`, when `state.step === 'github-token'`, strip the `/git login ` prefix from the user's message before passing it to the callback handler. Pass username and token separately to `setWorkspaceCredentials`.

**Alternatives considered**:
- Have the setup wizard prompt for username and token in separate steps — more steps, worse UX
- Reuse the existing `/git login` command handler directly from the wizard instead of duplicating logic — better, but requires refactoring the command handler to be callable programmatically

### D3: Help text — single source of truth pattern

**Decision**: Centralize the help text in a single place rather than having scattered message strings. The `/help` command output should be the canonical reference. Where possible, reuse the same text for inline guidance to avoid divergence.

**Alternatives considered**:
- Keep help text inline in the handler — works but will drift again
- Generate help from command registration — too coupled to bot framework internals

### D4: `/opencode` command — honest description

**Decision**: Rename description from "Send raw OpenCode command" to "Send text to active session (alias for /send)" to accurately reflect behavior.

### D5: `help.txt` — clarify purpose

**Decision**: Rename `help.txt` to `docker-workspace-build.txt` or add a header comment explaining it's a Docker build hint, not Telegram help.

## Risks / Trade-offs

- **[Risk]** Moving credential status to a new command name (`/git credential-status`) may confuse existing users who relied on `/git status` for credentials → Mitigation: include a deprecation notice in the output temporarily
- **[Risk]** Centralizing help text in one location could make it harder to send contextual help → Mitigation: use a shared helper function that can return the full help or specific sections
- **[Risk]** The setup wizard fix assumes users always type `/git login` with that exact format → Mitigation: accept both formats (with and without the `/git login` prefix), detect and strip automatically
