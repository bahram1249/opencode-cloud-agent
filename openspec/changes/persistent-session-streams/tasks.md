## 1. Refactor StreamService data model

- [x] 1.1 Change `Map<publicId, StreamEntry>` to `Map<publicId, Map<streamId, StreamEntry>>` — define `StreamEntry` interface with `chatId`, `messageId`, `readOutput`, `lastFlush`, `keyboard` (keyboard buttons), `status`
- [x] 1.2 Add stream ID generation utility (short random IDs like `v-XXXX` or auto-increment per session)
- [x] 1.3 Update `sendSessionStart` to create the initial entry in the nested map with the live keyboard layout
- [x] 1.4 Update `appendOutput` to iterate all entries for the session on flush
- [x] 1.5 Update `flush` to call `editMessageText` for every live entry, catching errors per-entry (remove failed entries)
- [x] 1.6 Update `sendSessionEnd` to edit ALL entries with final status/output and switch keyboard to only `[🔄 Refresh]`, keep entries in map (don't delete)
- [x] 1.7 Update `showSessionOutput` to work with new map structure (no behavior change needed)

## 2. Add switch-back stream creation

- [x] 2.1 Add `createStreamView(chatId, sessionPublicId, readOutput): streamId` method to StreamService — sends new Telegram message with "(continued)" label, adds entry to nested map
- [x] 2.2 In `telegram-session.handler.ts`, update `handleSessCallback` for `sess:switch` to call `createStreamView` after `switchUserSession`, creating a new live stream for the switched-to session

## 3. Add refresh button

- [x] 3.1 Add `refreshEntry(publicId, streamId): Promise<void>` method to StreamService — reads xterm buffer via `readOutput`, edits the specific entry's message, preserves current keyboard layout
- [x] 3.2 Add callback routing in `telegram-session.handler.ts` for `sess:refresh` — parse streamId from callback value, call `refreshEntry`
- [x] 3.3 Update callback data format in `flush()` to include `streamId` alongside session info for refresh targeting

## 4. Update keyboard layout

- [x] 4.1 Add `[🔄 Refresh]` button to the live session keyboard in `StreamService.flush()` — third row: `[🔄 Refresh]` `[✕ Ctrl+C]`
- [x] 4.2 Ensure callback data for Refresh carries both `publicId` and `streamId` so it targets the correct entry
- [x] 4.3 Define finished-session keyboard (single `[🔄 Refresh]` button) used by `sendSessionEnd`
- [x] 4.4 Make keyboard configurable per stream entry via a `status` field in `StreamEntry`

## 5. Edge cases and resilience

- [x] 5.1 Handle `editMessageText` 400 errors (message too old, deleted) — remove that entry from the stream map, log at debug level
- [x] 5.2 Implement per-entry minimum edit interval (e.g., 500ms between edits per entry) as backpressure against Telegram rate limits — if flush fires faster, skip that entry
- [x] 5.3 Verify that `showSessionOutput` (used by `/sessions` "Show" button) still works independently of the live stream entries

## 6. Verify

- [x] 6.1 Build project: `npm run build` — no TypeScript errors
- [x] 6.2 Lint: `npm run lint` — no errors in changed files (pre-existing errors in other files)
- [ ] 6.3 (manual) Start app and verify: multiple live streams, switch-back creates new message, refresh button works, session list shows all workspaces
