## Context

The Mini App authenticates via three paths: query param `tgWebAppData`, query param `initData`, or query param `token` (custom HMAC token with `ma_` prefix). The server validates all three equivalently. However, `mini-app.controller.ts` injects the raw URL query param named `initData` into `window.__INITIAL_STATE__` — which is undefined when the user arrives via `?token=ma_xxx` or `?tgWebAppData=xxx`. The frontend's `app.js` reads `state.initData` to set the `X-Telegram-Init-Data` header on every API call, so all requests fail with 401.

Secondary issues compound this: tokens expire in 5 minutes; some bot-generated Mini App URLs lack tokens entirely; the frontend prefers `tgWebApp.initData` over the server-provided state; WebSocket input routes to the wrong session; session endpoints lack user ownership checks.

## Goals / Non-Goals

**Goals:**

- Mini App works when opened via any bot-generated URL with `?token=ma_xxx`
- All REST API calls and WebSocket connections carry the token as `X-Telegram-Init-Data` / WebSocket query param
- "Open in Mini App" buttons in all bot messages include a valid token
- Opening a Mini App from a running session auto-navigates to that session's terminal
- WebSocket keyboard input goes to the correct session (the one the terminal is connected to)
- Token expiry is long enough for realistic usage (60 minutes)
- Session cancellation and detail endpoints enforce user ownership
- Model dropdown loads when a provider is configured (not when projects exist)

**Non-Goals:**

- Token refresh mechanism (60-minute expiry is sufficient for a session-based app)
- Persisting tokens or adding refresh tokens
- Changing the Telegram bot side of auth (it already works)
- Full architectural rewrite of the Mini App

## Decisions

### 1. State injection: use `rawData`, not the query param

**Decision**: `mini-app.controller.ts` stores `rawData` in `state.initData`, where `rawData` is whichever auth string was validated (token, tgWebAppData, or initData query param).

**Rationale**: The controller already normalizes all three auth sources into `rawData`. The state field name `initData` is fine — it just needs to hold the validated auth string regardless of source. No new state field needed.

**Alternatives considered**: Adding a new state field `state.token`. Rejected — the frontend already expects `state.initData` and the `TelegramInitDataGuard` already accepts the token as initData.

### 2. Auth precedence: token from state first

**Decision**: `app.js` reads `state.initData` first, falls back to `tgWebApp?.initData`.

**Rationale**: When using token auth, the token is the source of truth. `tgWebApp?.initData` is only relevant when opening in a real Telegram WebView without a custom token. This order ensures the system works identically in browser dev mode and in production Telegram WebView.

### 3. Token expiry: 5 min → 60 min

**Decision**: `auth-token.ts` expiry changed from 300,000ms to 3,600,000ms (60 minutes).

**Rationale**: A Mini App session typically lasts 15-45 minutes (starting a session, watching output, interacting). 5 minutes is too short for any realistic use. 60 minutes covers the longest interaction without requiring a refresh mechanism. Shorter expiry would require implementing token refresh, which adds complexity with no clear benefit for this use case.

**Risk**: Tokens are embedded in the page source. A 60-minute window is a longer exposure if an attacker captures the page HTML. Mitigation: tokens are single-purpose (only valid for the Mini App API on this server), not reusable for Telegram API or other services.

### 4. Mini App URLs: add tokens everywhere

**Decision**: Both `telegram-menus.ts` (session context menu) and `stream.service.ts` (fallback paths) generate Mini App URLs with `?session=&token=`.

**Rationale**: Currently `telegram-menus.ts` generates URLs without any auth (line 158: `?session=...` only). The user clicks "Open in Mini App" and gets either a 401 or dev mode with no data. Token generation requires the bot token, which both services already have via ConfigService.

**Implementation**: Extract the token-generation logic into a shared helper, or inject it into `MenuServices`. The `stream.service.ts` already has `miniAppUrlWithToken()`. The `telegram-menus.ts` doesn't have access to `generateAuthToken` or the bot token — it needs `ConfigService` injected or the token URL passed in from the caller.

### 5. Auto-navigate from `?session=` URL param

**Decision**: On page load, `app.js` parses `window.location.search` for `session` parameter. If present, navigate to `#session/{value}` after the dashboard first render.

**Rationale**: The bot generates URLs like `/mini-app?session=s-xxxx&token=ma_xxx`. Without auto-navigation, the user lands on the Dashboard and must manually navigate. Since the token is session-specific (generated per session), it's natural to land on that session's terminal.

### 6. WebSocket input routing: by connected session, not user's current

**Decision**: `session.gateway.ts` stores `conn.sessionPublicId` and looks up the session by that ID (via a new `SessionService.findByPublicId()`), instead of using `getUserSession(conn.userId)`.

**Rationale**: A user may have multiple sessions. Each WebSocket connection tracks which session it belongs to (stored in `conn.sessionPublicId`). When the user types in terminal A, input should go to session A, not whatever `getUserSession` considers "current". This is the correct semantic regardless of auth method.

### 7. User ownership checks on session endpoints

**Decision**: `SessionsController.cancel()` and `findOne()` require `@InitDataUser('id')` and verify the session belongs to that user before proceeding.

**Rationale**: These endpoints currently allow any authenticated user to cancel or read any session by ID. With the token auth fix, all API calls will succeed — making the missing ownership checks a security hole. The fix is minimal: extract userId from the guard and compare against `session.createdBy`.

## Risks / Trade-offs

- **[Risk]** Token embedded in page source visible to anyone who can access the page → **Mitigation**: Token is single-purpose (Mini App API only), short-lived (60 min), HTTPS-only. No sensitive data exposure beyond what the authenticated user can already access.
- **[Risk]** WebSocket session lookup by publicId adds a linear scan over the sessions map → **Mitigation**: Use a secondary `Map<publicId, sessionId>` index. The number of concurrent sessions is bounded (one per user, typically <50), so a linear scan is also acceptable.
- **[Trade-off]** 60-minute token vs 5-minute token → Longer window for token theft, but eliminates need for refresh infrastructure. Acceptable for an orchestrator tool used by trusted operators.
- **[Trade-off]** Auto-navigate on page load vs explicit navigation → Sometimes the user wants the Dashboard, not the session terminal. Mitigation: `?session=` query param only triggers auto-nav when present. If absent, normal Dashboard loads.
