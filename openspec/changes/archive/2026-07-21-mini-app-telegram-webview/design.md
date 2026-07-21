## Context

The opencode-orchestrator currently exposes all capabilities through a Telegram bot interface (slash commands + inline keyboards). This has inherent constraints: 4K character limit on output, ANSI/TUI stripping, debounced message editing instead of real-time streaming, and inline keyboard buttons for terminal control. Users on Telegram can interact with sessions but the experience is limited compared to a real terminal.

Adding a Telegram Mini App provides a full WebView-based interface without replacing the bot. Both interfaces coexist — users can interact via chat for quick commands or open the Mini App for full terminal access.

## Goals / Non-Goals

**Goals:**
- Serve a Telegram Mini App SPA from NestJS with zero framework dependencies on the client
- REST API controllers exposing all workspace, project, session, git, and model operations
- WebSocket gateway piping raw PTY output to xterm.js in real time
- AGENTS.md codifying "apply changes to both interfaces" as a development convention
- WebAppInfo button on live session messages to launch the Mini App
- All existing bot commands and inline keyboards continue working unchanged

**Non-Goals:**
- Refactoring the existing service layer or bot handlers
- Adding authentication beyond Telegram WebApp initData validation
- Supporting non-Telegram web access (no login page, no API tokens)
- Adding a frontend build pipeline or bundler
- Replacing the bot interface — both coexist permanently

## Decisions

**1. Serving Model: NestJS serves the Mini App**
- Single origin: the Mini App HTML, JS, CSS, API calls, and WebSocket all come from the same host
- No CORS issues, no separate deployment, no reverse proxy
- `@nestjs/serve-static` for assets, `@Controller('mini-app')` for the main page
- The controller validates initData and injects initial state into the HTML before serving

**2. No Client Framework — Vanilla JS with Hash Routing**
- Three static files: `index.html` (shell + xterm CDN), `app.js` (all logic), `styles.css`
- Hash-based routing via `hashchange` event — screens: `#dashboard`, `#workspace/:id`, `#project/:id`, `#session/:id`, `#git/:wid`
- Each route handler is a function that fetches data via `fetch()` and renders DOM with `createElement`/`innerHTML`
- xterm.js loaded from CDN, instantiated when the terminal screen is active
- Rationale: Telegram WebView is an ephemeral context — no need for a full SPA framework. Minimal payload, fast load.

**3. REST API Controllers (New `ApiModule`)**
- New controllers alongside existing ones — not replacing the Telegram controller
- Each controller calls the same service layer as the bot handlers
- Routes: `/api/workspaces`, `/api/workspaces/:id/projects`, `/api/sessions`, `/api/git/:wid/:action`, `/api/models/:wid`
- Authentication via `X-Telegram-Init-Data` header validated by a NestJS guard
- The guard extracts user.id → calls `ensureTenant()` exactly like the bot does

**4. WebSocket Gateway (New `GatewayModule`)**
- `@WebSocketGateway({ namespace: '/gateway' })` using `@nestjs/websockets` + `socket.io`
- On connect: client sends initData (validated), session publicId → server replays full terminal buffer, then pipes live output
- Input: client sends keyboard events → `sessionService.sendKey()` or `sendToSession()`
- Output: `session.emitter.on('output', data => client.emit('terminal:data', data))` — same emitter the StreamService listens to
- Multiple clients per session supported (like StreamService's multi-viewer model)

**5. initData Validation**
- HMAC-SHA256 of `WebApp.initData` using the bot token as secret
- Implemented as `TelegramInitDataGuard` — reusable across REST and WS
- Extracts `user.id` and `user.first_name` from the validated data
- Same `ensureTenant()` call used by bot handlers

**6. AGENTS.md Content**
- Placed at repo root, referenced by opencode
- States: "This project has two UI interfaces — a Telegram bot (slash commands + inline keyboards) and a Telegram Mini App (WebView SPA). Every feature and bug fix must be implemented in both. Neither interface is secondary."

## Risks / Trade-offs

- **Risk: Mini App breaks while bot works** → Mitigation: AGENTS.md convention + code review checklist. Every PR must touch both paths or explicitly justify single-path changes.
- **Risk: initData HMAC validation fails silently** → Mitigation: Guard returns clear error messages, Mini App shows "Authentication failed" screen with retry.
- **Risk: WebSocket reconnection complexity** → Mitigation: Socket.IO handles reconnection. On reconnect, server replays full terminal buffer.
- **Risk: Vanilla JS SPA becomes unmaintainable as it grows** → Mitigation: The SPA surface is bounded by the existing bot capabilities (11 specs). If it grows significantly, a framework migration can be evaluated later.
- **Trade-off: Dual-maintenance cost** → The "both interfaces" rule doubles UI work, but the service layer is shared so business logic changes are single-touch.
