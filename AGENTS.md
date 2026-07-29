# OpenCode Orchestrator — Development Conventions

## Dual-Interface Development

This project has two UI interfaces for all capabilities:

1. **Telegram Bot** — slash commands, inline keyboards, live session streaming via `editMessageText`
2. **Telegram Mini App** — WebView SPA with REST API + WebSocket, served from NestJS

**Every feature and bug fix MUST be implemented in both interfaces.** Neither interface is secondary. Both must remain functional throughout development.

### When adding a new feature

1. Add it to the **service layer** (shared business logic — single touch)
2. Add a **bot handler** (slash command + inline keyboard callback)
3. Add a **REST API endpoint** (if not already covered by existing endpoints)
4. Add a **Mini App UI screen or component** (app.js render function)

### When fixing a bug

1. If the bug is in the **service layer** — fix once, both interfaces benefit
2. If the bug is in a **specific interface** — check if the same bug class exists in the other interface and fix both
3. If the fix only applies to one interface (e.g., ANSI stripping in bot output) — document the reason in the commit message

### Acceptable single-interface changes

- The change is to an interface-specific implementation detail (e.g., inline keyboard layout, CSS styling)
- The capability is inherently Telegram-specific or Web-specific (e.g., WebApp initData handling)
- The other interface is temporarily disabled with a tracking issue

### Code review

When only one interface is modified, the PR description MUST explain why the other interface does not need the change.
