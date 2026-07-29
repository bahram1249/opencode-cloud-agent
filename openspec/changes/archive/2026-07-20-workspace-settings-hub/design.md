## Context

The Telegram bot currently provides workspace management through over a dozen slash commands, a separate 4-step setup wizard (`/setup`), and scattered inline actions on a minimal workspace details card. There is no single entry point for configuring a workspace — provider API keys are set via `/workspace provider`, git credentials via `/git login`, model via `/workspace models` (inline picker) or `/workspace model` (command), and projects via `/project`. The model picker silently truncates at 24 items. Help is a single static text block.

The existing architecture uses in-memory Maps for transient state (wizard state, model callback keys) and Prisma/SQLite for persistent data. Telegram callbacks are routed by namespace prefix (`ws:`, `proj:`, `git:`, `model:`, `setup:`, `nav:`, etc.) through a central `handleCallback` dispatcher. The notification service can only send new messages — it cannot edit existing ones.

## Goals / Non-Goals

**Goals:**
- Single settings screen per workspace showing provider, model, projects, git, and sessions with drill-down sub-screens
- Workspace list dashboard with per-row provider/model/project badges
- Paginated model picker with next/prev navigation editing the same message in place
- Contextual ❓ help button on every screen
- Merge `/setup` wizard into Settings — `/setup` opens settings for active workspace
- Consolidate model to workspace level only (remove per-project provider/model)
- Gateway commands (`/workspace provider`, `/git login`) remain functional but route through Settings internally

**Non-Goals:**
- No data migration of existing credentials — providerId, apiKey, gitToken, gitUsername stay on the Workspace model
- No RBAC or multi-user workspace sharing
- No settings synchronization between workspaces (no tenant-level defaults)
- No web UI — Telegram-only

## Decisions

### D1: Message editing over new messages for navigation
Paginating the model picker or navigating from Settings to a sub-screen and back sends a new message each time, cluttering the chat. Telegram supports `editMessageText` and `editMessageReplyMarkup`, which update the existing message in place.

**Decision:** Add `editMessage(chatId, messageId, text, keyboard?)` to `NotificationService`. Thread `messageId` through callback handlers so sub-screens and pagination can edit the same message.

**Alternatives considered:**
- *New messages only* — simpler but creates chat pollution; user must scroll past stale screens.
- *Delete-and-send* — faster than edit on slow connections but produces visual flicker and loses message position in chat.

### D2: In-memory model callback store with page context
The current `modelCallbackStore` maps incrementing integer keys to `{workspaceId, model}` tuples. For pagination, the store needs to know which page is being viewed to re-render.

**Decision:** Keep the in-memory store for model selection (avoids encoding full model names in 64-byte callback data). Extend the store to support page entries. Navigation callbacks (`model:page:next:<wsId>`, `model:page:prev:<wsId>`) do not need the store — the handler re-fetches the model list, slices the requested page, and edits the message.

Callback data budget:
- Model selection: `{"t":"model:pick","v":"42"}` — 27 bytes (in-memory key)
- Next page: `{"t":"model:np","v":"wsId"}` — 25 bytes (no page num needed — store last viewed page per chat)
- Prev page: `{"t":"model:pp","v":"wsId"}` — 25 bytes

**Alternatives considered:**
- *Encode page + model index in callback* — hits 64-byte limit on long workspace IDs when combined with JSON structure.
- *Persist pagination state in DB* — unnecessary complexity for transient UI state.

### D3: Settings screen replaces workspace details card inline
The current `sendWorkspaceDetails()` sends a card with project list, provider name, and action buttons. Rather than creating a separate "Settings" concept, this card is redesigned in place as the Settings hub.

**Decision:** `sendWorkspaceDetails()` is rewritten as `showWorkspaceSettings()` — the same function that renders when tapping a workspace from the list. All sub-screens (provider picker, model picker, project management, git management, session list) edit the same message. A "Back to Settings" action re-renders the settings view.

### D4: No dedicated settings service — use WorkspaceService
The Workspace model already stores `providerId`, `apiKey`, `model`, `gitToken`, `gitUsername`. Adding an abstraction layer on top of these (a `WorkspaceSettingsService`) would add indirection without benefit since all settings are per-workspace and map 1:1 to existing model fields.

**Decision:** The Settings hub reads/writes directly through `WorkspaceService`. Gateway commands (`/workspace provider`, `/git login`) call the same service methods. No new service layer.

**Alternatives considered:**
- *New `WorkspaceSettingsService`* — clean separation but unnecessary indirection for simple CRUD on existing fields.

### D5: Contextual help as a static const map
Each screen has a help text. Rather than a database or file-per-screen approach, a single `CONTEXTUAL_HELP` map in `telegram-help.ts` maps screen identifiers to markdown strings.

**Decision:**
```typescript
const CONTEXTUAL_HELP: Record<string, string> = {
  'workspace-list': '...',
  'settings': '...',
  'model-picker': '...',
  'provider-picker': '...',
  'project-list': '...',
  'git-manage': '...',
  'session-list': '...',
};
```

Each screen builder adds a `❓ Help` button. The callback handler reads from the map and sends the relevant help text as a new message (not an edit — help is a reference card, not navigation).

### D6: Workspace list badges from existing fields
Provider badge color, model name, and project count are all derivable from existing `Workspace` fields — no new DB columns needed.

**Decision:**
```
✅ my-app  🔵 opencode  🤖 gpt-4  📁3  🔑✓
```
Badge logic:
- Provider icon: `providerIcons[ws.providerId] ?? '⚪'` (non-configured → ⚪)
- Model: `ws.model ?? '—'` (no model → `—`)
- Project count: `ws.projects.length`
- Git: `ws.gitToken ? '🔑✓' : '🔑✗'`

## Risks / Trade-offs

- **[Message edit rate limiting]** — Telegram rate-limits `editMessageText` to ~20 edits/min per chat. If a user rapidly paginates through models, edits may be silently dropped. **Mitigation:** Debounce pagination callbacks client-side (Telegram's `answerCbQuery` with alert for rapid-fire) and accept occasional dropped edits as harmless.
- **[In-memory state loss on restart]** — `modelCallbackStore` is in-memory. Server restart invalidates all pending model selection callbacks. **Mitigation:** Callbacks contain enough context (`{"t":"model:pick","v":"42"}`) for the handler to reject stale keys gracefully with "Selection expired, please pick again."
- **[64-byte callback data limit]** — Current encoding fits comfortably within 64 bytes. As new features add more callback types, this must be monitored. **Mitigation:** Use the most compact encoding possible. Namespace prefix already acts as a compression key.
- **[Removing per-project provider/model]** — Existing users may have projects with `provider` set. The field must be removed from the DB schema and any code referencing it must be updated. **Mitigation:** Prisma migration drops the column; existing data is discarded. Validate that no code path reads this field before deploying.
- **[Command removal confusion]** — Users accustomed to `/workspace provider` or `/git login` may be confused if the commands disappear. **Decision:** Keep the commands as working shortcuts that internally route through the Settings hub — no removal of existing commands.

## Migration Plan

1. Add `editMessage` to `NotificationService` — no behavioral change, purely additive
2. Rewrite `sendWorkspaceDetails()` as `showWorkspaceSettings()` — new code replaces old
3. Add contextual help map to `telegram-help.ts` and wire ❓ buttons into all screen builders
4. Add pagination to `showModelPicker()` — edit-based navigation, page store
5. Enrich `showWorkspaceMenu()` with status badges
6. Reroute `/setup` command to settings screen, remove wizard state machine
7. Remove per-project `provider` field from Prisma schema and project handlers
8. Remove `telegram-setup.handler.ts` wizard code
9. Thread `messageId` through callback handlers
10. Verify all callbacks still route correctly with new namespace

Rollback: Revert the `telegram-menus.ts`, `telegram-workspace.handler.ts`, and `notification.service.ts` changes. Restore `telegram-setup.handler.ts` if removed. Roll back Prisma migration.

## Open Questions

- Should the sessions sub-screen show only sessions for the current workspace, or all sessions across all workspaces (as the current `/sessions` command does)? Proposal says workspace-level, consistent with Settings scope.
- Model picker page size: 8 items per page (fits Telegram keyboard without scroll) or 10? 8 is the visual maximum without scrolling on most devices.
