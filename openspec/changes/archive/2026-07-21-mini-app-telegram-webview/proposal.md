## Why

The Telegram bot interface has inherent UX limitations: 4K character message cap, no real ANSI rendering, lossy output cleaning, inline keyboard instead of real terminal input, and no scrollback. Adding a Telegram Mini App (WebView-based SPA) provides a full browser-grade interface while keeping the bot as a parallel interaction channel.

Every capability must work from both interfaces — the Mini App does not replace the bot. Both must remain functional throughout development.

## What Changes

- Serve a static HTML/JS Mini App from NestJS at `GET /mini-app` with Telegram WebApp initData validation
- Create REST API controllers for all management operations (workspaces, projects, sessions, git, models)
- Create WebSocket gateway for real-time session terminal streaming
- Add AGENTS.md codifying the "apply changes to both interfaces" development convention
- Add a `WebAppInfo` button to session messages so users can open the Mini App from the bot
- All existing bot commands and inline keyboards continue working unchanged
- All existing service layer code is reused — no refactoring of core logic

## Capabilities

### New Capabilities

- `mini-app-serve`: Serve the Mini App SPA from NestJS — HTML shell, static assets (JS/CSS), initData validation, initial state injection
- `mini-app-api`: REST API controllers for workspace CRUD, project CRUD, session list/create/cancel, git operations, model listing — all consume existing service layer
- `mini-app-gateway`: WebSocket gateway for real-time session terminal — pipes raw PTY output to xterm.js, accepts keyboard input, supports replay on connect
- `mini-app-ui`: Client-side SPA with hash routing — dashboard, workspace settings, project detail, terminal view, git operations, session list — all built with vanilla HTML/JS/CSS, no framework
- `dual-interface-convention`: AGENTS.md documenting the rule that every feature and bug fix must be applied to both the Telegram bot interface and the Mini App interface

### Modified Capabilities

- `persistent-session-streams`: Add WebSocket as a second output channel alongside the existing Telegram editMessage stream. Both channels operate concurrently for the same PTY.
- `workspace-settings-hub`: Mini App provides a richer settings UI (forms, dropdowns) as an alternative to the inline-keyboard settings hub. The bot's settings hub remains unchanged.
- `session-refresh-button`: No longer needed for Mini App (xterm.js is real-time), but must remain in the bot interface.

## Impact

- **New modules**: `MiniAppModule` (controller + static serve), `ApiModule` (REST controllers), `GatewayModule` (WebSocket)
- **New files**: `AGENTS.md` (repo root), `src/modules/mini-app/*`, `src/modules/api/*`, `src/modules/gateway/*`, `src/modules/mini-app/public/*` (HTML, JS, CSS)
- **Modified files**: `src/main.ts` (WebSocket adapter, static assets config), `src/modules/telegram/handlers/telegram-session.handler.ts` (WebApp button)
- **Dependencies**: `@nestjs/platform-socket.io` or `@nestjs/websockets`, `xterm.js` (CDN)
- **No changes to**: Service layer (SessionService, WorkspaceService, GitCommandsService), DockerWorkspaceService, Prisma schema, bot handlers logic
- **No breaking changes**: Existing bot commands, inline keyboards, and session streaming continue working
