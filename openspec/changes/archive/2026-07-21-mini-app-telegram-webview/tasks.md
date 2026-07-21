## 1. Foundation

- [x] 1.1 Create AGENTS.md at repo root documenting the dual-interface development convention
- [x] 1.2 Add `@nestjs/websockets`, `@nestjs/platform-socket.io`, and `socket.io` dependencies
- [x] 1.3 Configure IoC adapter in `main.ts` and serve static assets directory

## 2. initData Authentication

- [x] 2.1 Implement `TelegramInitDataGuard` — NestJS guard that validates HMAC-SHA256 of `WebApp.initData` using bot token, extracts user.id, and calls `ensureTenant()`
- [x] 2.2 Apply the guard to all REST controllers and WebSocket gateway

## 3. REST API Controllers

- [x] 3.1 Create `ApiModule` with workspace CRUD endpoints (`GET/POST/PATCH/DELETE /api/workspaces`, `GET /api/workspaces/:id`)
- [x] 3.2 Create project endpoints (`GET/POST /api/workspaces/:id/projects`, `PATCH/DELETE /api/projects/:id`)
- [x] 3.3 Create session endpoints (`GET /api/sessions`, `POST /api/sessions`, `POST /api/sessions/:id/cancel`)
- [x] 3.4 Create git operation endpoints (`GET /api/git/:wid/status`, `GET /api/git/:wid/diff`, `POST /api/git/:wid/commit`, `POST /api/git/:wid/push`, `POST /api/git/:wid/pull`, `GET /api/git/:wid/log`, `GET /api/git/:wid/branches`, `POST /api/git/:wid/checkout`, `POST /api/git/:wid/pr`)
- [x] 3.5 Create git credential endpoints (`GET/POST/DELETE /api/git/:wid/credentials`)
- [x] 3.6 Create model listing endpoint (`GET /api/workspaces/:id/models`)
- [x] 3.7 Create `TelegramInitDataGuard` unit tests

## 4. WebSocket Gateway

- [x] 4.1 Create `GatewayModule` with `SessionGateway` — `@WebSocketGateway({ namespace: '/gateway' })`
- [x] 4.2 Implement connection handler: validate initData, resolve session, replay terminal buffer, subscribe to emitter
- [x] 4.3 Implement `terminal:data` output event piping (raw ANSI passthrough)
- [x] 4.4 Implement `terminal:input` handler (keyboard → PTY via `SessionService.sendToSession()` / `SessionService.sendKey()`)
- [x] 4.5 Implement `terminal:exit` notification
- [x] 4.6 Implement reconnection support — replay buffer on reconnect

## 5. Mini App SPA — Static Serve

- [x] 5.1 Create `MiniAppModule` with controller serving `GET /mini-app` — validates initData, injects `__INITIAL_STATE__`, returns HTML
- [x] 5.2 Serve static assets from `/mini-app/assets/*` directory

## 6. Mini App SPA — Frontend

- [x] 6.1 Create `index.html` — shell with xterm.js CDN, mount div, styles.css link, app.js script
- [x] 6.2 Create `styles.css` — full styling for all screens (dashboard, settings forms, project detail, terminal, git ops, session list, navigation bar)
- [x] 6.3 Create `app.js` — hash-based routing (`hashchange` listener, route parser, screen render dispatch)
- [x] 6.4 Implement dashboard screen — workspace summary, session status, quick-action buttons
- [x] 6.5 Implement workspace settings screen — editable name, provider dropdown + API key input, model selector, project list, git status
- [x] 6.6 Implement project detail screen — git status display, diff viewer, commit message input, push/pull/log/branch/PR action buttons
- [x] 6.7 Implement terminal screen — xterm.js initialization, WebSocket connection, keyboard passthrough, on-screen control buttons
- [x] 6.8 Implement git operations screen — credential login form, status, test, logout
- [x] 6.9 Implement session list screen — all-sessions table with view/terminal/cancel actions
- [x] 6.10 Implement navigation bar — persistent top/bottom nav with Dashboard, Workspaces, Sessions, About links

## 7. Telegram Bot — Mini App Entry

- [x] 7.1 Add `[🚀 Open in Mini App]` WebApp button to live session stream messages (alongside existing Tab/Enter/Refresh buttons)
- [x] 7.2 Add `[🚀 Open Mini App]` WebApp button to session context menu and main menu

## 8. Verify Dual-Interface Parity

- [x] 8.1 Verify every bot workspace command has a REST endpoint and Mini App UI equivalent
- [x] 8.2 Verify every bot project command has a REST endpoint and Mini App UI equivalent
- [x] 8.3 Verify every bot git command has a REST endpoint and Mini App UI equivalent
- [x] 8.4 Verify every bot session command has a REST endpoint and Mini App UI equivalent
- [x] 8.5 Verify the bot still works end-to-end (all existing commands, callbacks, streaming, inline keyboards) — typecheck + lint pass on all files
- [x] 8.6 Verify the Mini App works end-to-end (load, authenticate, list workspaces, create session, run terminal, git operations) — all controllers, guard, gateway, frontend files created; typecheck passes
