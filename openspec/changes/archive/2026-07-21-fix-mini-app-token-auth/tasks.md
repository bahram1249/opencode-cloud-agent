## 1. Backend — Token state injection fix

- [x] 1.1 Change `mini-app.controller.ts` state to store `rawData` (the validated auth string) instead of the raw query param `initData`
- [x] 1.2 Pass `session` query param through to `window.__INITIAL_STATE__`
- [x] 1.3 Remove the dev mode fallback (user.id=0) — with token auth, every request must be authenticated

## 2. Backend — Auth token expiry

- [x] 2.1 Change `auth-token.ts` expiry from `300_000` (5 min) to `3_600_000` (60 min)

## 3. Backend — Bot Mini App URL token inclusion

- [x] 3.1 Add `generateAuthToken` import and `botToken` injection to `telegram-menus.ts` (via `MenuServices` interface)
- [x] 3.2 Generate and append `&token=...` to the Mini App URL in `showSessionContext()`
- [x] 3.3 Checked `stream.service.ts` fallback paths — `miniAppUrlWithToken` already handles token generation correctly; fallback sans-token paths are edge-case-only

## 4. Backend — WebSocket session routing fix

- [x] 4.1 Add `findByPublicId(publicId: string)` method to `SessionService` that looks up session by `publicId` (iterate `sessions` map values)
- [x] 4.2 Change `session.gateway.ts` `handleInput()` to look up session by `conn.sessionPublicId` using the new method, instead of `getUserSession(conn.userId)`
- [x] 4.3 Fix unhandled promise rejection in `handleInput()` — `void this.sessionService.sendToSession(...)` → `.catch(err => client.emit('error', err.message))`

## 5. Backend — User ownership checks

- [x] 5.1 Add `@InitDataUser('id')` userId param to `SessionsController.cancel()` and verify the session's `createdBy` matches
- [x] 5.2 Add `@InitDataUser('id')` userId param to `SessionsController.findOne()` and verify the session's `createdBy` matches

## 6. Backend — Telegram menus token injection

- [x] 6.1 Added `botToken` to `MenuServices` interface, provided by `TelegramSessionHandler` via ConfigService
- [x] 6.2 `showSessionContext()` generates Mini App URL with token using `generateAuthToken()` directly

## 7. Frontend — Auth precedence

- [x] 7.1 Change `app.js` auth precedence: `state.initData` first, then `tgWebApp?.initData` fallback
- [x] 7.2 Remove dev mode banner

## 8. Frontend — Auto-navigate on page load

- [x] 8.1 Read `state.session` on page load in `app.js`
- [x] 8.2 After initial `renderRoute()`, if `state.session` is set, navigate to `#session/{state.session}`

## 9. Frontend — Model loading condition

- [x] 9.1 Change `renderWorkspaceSettings()` in `app.js` to load models when `ws.providerId` is set, not when `ws.projects?.length > 0`
- [x] 9.2 Updated model dropdown message

## 10. Frontend — onclick escaping

- [x] 10.1 Replace `esc()` usage in onclick handler values with `jsStr()` (proper JS string escaping)

## 11. Verify

- [x] 11.1 Run `npm run lint` and `npm run typecheck` — `typecheck` passes, `lint` has 14 pre-existing errors (none in changed files)
- [x] 11.2 Run existing tests — all 25 pass
