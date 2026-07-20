## Context

The system has three layers for session output:

```
PTY (docker exec opencode)
  → onData → cleanOutput → session.outputBuffer + emitter.emit('output')
                                   → StreamService.appendOutput()
                                     → debounce 300ms → flush()
                                       → read xterm buffer → editMessageText
```

**Current limitations:**

1. **One stream entry per session** — `StreamService.sessions` maps one `publicId` → one `{messageId, chatId, readOutput}`. When the user switches back to a session, there's no mechanism to create a new streaming message. The single message keeps editing, which means no "switch-back continuity" UX.

2. **Stream dies with session** — `sendSessionEnd` removes the stream entry from the map. The final message gets status text and empty keyboard. After that, no updates possible.

3. **No manual refresh** — The keyboard has Tab/Enter/Up/Down/Ctrl+C but no way to manually pull the latest xterm buffer state if a user missed live updates or closed/reopened the message.

4. **Sessions are technically workspace-scoped** — `getUserSessions` already queries all sessions for a user (in-memory map), so this largely works. But the UI (`/sessions` list) doesn't emphasize cross-workspace visibility.

## Goals / Non-Goals

**Goals:**
- Every session's Telegram message stays live-updating as long as the PTY runs
- Switching back to a session creates a new live-streaming message
- The old message also keeps streaming (all streams always live)
- `[🔄 Refresh]` button on every session message to manually re-read xterm buffer
- `/sessions` lists all sessions across all workspaces with workspace name as context
- Session PTYs survive workspace switches (containers stay alive)

**Non-Goals:**
- Replaying session history from DB for already-finished sessions (out of scope)
- Multiple users sharing a session view (each user gets their own streams)
- Session persistence across server restarts (in-memory PTYs die with process)

## Decisions

### Decision 1: Multi-entry stream map

**Option A — Keep session map, add stream ID layer:**

```
StreamService.sessions:
  Map<sessionPublicId, Map<streamId, StreamEntry>>
    where StreamEntry = { chatId, messageId, readOutput, lastFlush, status: 'live'|'frozen' }
```

On switch-back, a new `streamId` is generated and a new entry is added. Every flush iterates ALL entries for that session and edits all their messages. Output events from the session propagate to all entries.

**Option B — Array of entries:**

```
StreamService.sessions:
  Map<sessionPublicId, StreamEntry[]>
```

Simpler but weaker indexing. Chosen: **A** — cleaner lookup for per-entry refresh.

**Chosen: Option A** — `Map<publicId, Map<streamId, StreamEntry>>` with each entry having:
- `chatId`, `messageId` — Telegram message to edit
- `readOutput` — callback to read xterm buffer
- `lastFlush` — timestamp of last edit
- `status: 'live' | 'frozen'` — whether this stream keeps editing

### Decision 2: Flush only live entries; switch-back freezes old entries

`flush()` only edits entries with `status === 'live'`. Entries with `status === 'frozen'` or `status === 'finished'` are skipped.

When `createStreamView` is called (switch-back to a session), ALL existing live entries for that session are frozen BEFORE the new entry is added. Freezing:
- Sets `entry.status = 'frozen'`
- Edits the Telegram message to replace the keyboard with just `[🔄 Refresh]`
- The message content is updated to the latest buffer at the moment of freezing

This ensures the switched-to session has exactly one live stream (the new message), and all previous views become static snapshots.

Edge case: Telegram API errors on individual entries (e.g., message deleted) are caught silently; that entry is removed.

### Decision 3: Switch-back creates new stream

Flow:
```
User presses "👉 Switch" on session A
  → sessionService.switchUserSession(userId, sessionA.id)   (existing)
  → streamService.createStreamView(chatId, sessionA.publicId, sessionA.terminal)
    → sendMessage(chatId, "<b>Session s-XXXX</b> (continued)\n<code>...</code>")
    → add second entry to the session's stream map
    → wire output/exit events (already wired — just need the entry in map)
```

`createStreamView` is like `sendSessionStart` but:
- Labels the message as "(continued)" or shows a continuation indicator
- Does NOT re-wire the PTY or emitter (the existing wiring handles all output)
- Just adds a new message entry to the stream map

### Decision 4: Refresh button

New callback `sess:refresh` with the stream entry's `streamId` as value.

On callback:
1. Look up the stream entry by `publicId` + `streamId`
2. Read xterm buffer via `readOutput`
3. `editMessageText` with current content

This works even if:
- The entry was frozen (PTY exited but user wants latest buffer)
- The stream fell behind due to Telegram rate limits
- User closed/reopened chat and wants to sync

The refresh button replaces one of the existing buttons in the keyboard row.

### Decision 5: Keyboard layout

Current:
```
[↹ Tab] [↵ Enter]
[⬆ Up]   [⬇ Down]
[✕ Ctrl+C]
```

New:
```
[↹ Tab]   [↵ Enter]
[⬆ Up]     [⬇ Down]
[🔄 Refresh] [✕ Ctrl+C]
```

Refresh replaces nothing — added to the third row with Ctrl+C. Both get equal space.

### Decision 6: Stream entry state machine

Each stream entry has one of three states:

```
                    createStreamView
                    (freezes old entries)
  ┌─────────┐       ───────────────▶  ┌──────────┐
  │  live   │                         │  frozen  │
  └────┬────┘                         └────┬─────┘
       │                                   │
       │  sendSessionEnd                   │  sendSessionEnd
       │  (PTY exits)                      │  (PTY exits)
       ▼                                   ▼
  ┌──────────┐                     ┌──────────┐
  │ finished │                     │ finished │
  └──────────┘                     └──────────┘
```

- **`live`**: Entry is updated by `flush()`. Keyboard has full action set (Tab/Enter/Up/Down/Refresh/Ctrl+C).
- **`frozen`**: Entry is NOT updated by `flush()`. Keyboard is just `[🔄 Refresh]` — user can manually pull latest state.
- **`finished`**: Session PTY has exited. Keyboard is just `[🔄 Refresh]`. Entry stays in map indefinitely for manual refresh.

### Decision 7: Session end behavior

When a session's PTY exits:
- `sendSessionEnd` is called by the `exit` event handler
- All stream entries for that session are updated with final status and duration
- The inline keyboard changes: Tab/Enter/Up/Down removed (session is done), Refresh stays (user can still pull the final state)
- Keyboard becomes: `[🔄 Refresh]` (just the refresh button)
- Stream entries remain in the map (not deleted) — they stay as refreshable snapshots

This is a change from current behavior which removes the entry and clears all buttons.

### Decision 7: Workspace-independent session visibility

`getUserSessions` already returns all sessions across all workspaces. The `/sessions` command already shows workspace names in the list. No code changes needed — the existing behavior satisfies this requirement.

## Risks / Trade-offs

- **[Risk] Telegram editMessageText rate limits** — Editing N messages per output event means N× the API calls. If a user has 5 stream entries for one session, a burst of output could trigger 5 rapid edits. **Mitigation:** The 300ms debounce already aggregates output. But per-entry edits happen in parallel (not serial), so a burst of 5× rate is possible. If this triggers flood limits, implement a per-entry minimum interval (e.g., 1s between edits per entry, but flush can still run at 300ms globally).

- **[Risk] Edit window limit** — Telegram allows editing messages for 48h (or 72h for premium). After that, `editMessageText` returns 400 Bad Request. **Mitigation:** `appendOutput` catches and logs errors, silently removing entries that fail permanently due to age.

- **[Risk] Message deleted by user** — If the user deletes the stream message, all edits fail silently. **Mitigation:** Already handled — catch + log.

- **[Tradeoff] Old messages stay live** — With all entries streaming live, every stream message for the same session shows identical content (same xterm buffer read). Some users may find this redundant. The refresh button provides an alternative: user can let entries freeze naturally and pull updates on demand.

## Open Questions

- Should switch-back messages carry a different label? E.g., "(continued)" badge vs the standard session header. (Current implementation: "(continued)" appended.)
- How many stream entries per session before we cap it? (Practical limit is probably 3-5 before redundancy outweighs utility. Currently no cap.)
- Frozen entries accumulate over time — should we have an auto-cleanup for old frozen entries? (E.g., clear when session finishes.)
