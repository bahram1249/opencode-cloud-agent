## Why

Currently, when a user switches away from a session, its live stream freezes — the Telegram message stops updating. Sessions are also scoped to the workspace where they were created, making them effectively "lost" when switching workspaces. This makes multi-session workflows tedious: you have to remember which session was in which workspace, and refreshing a session's state requires switching back to it.

## What Changes

- **Always-on streams**: Every session's Telegram message keeps live-updating regardless of which session is "active" or which workspace the user is viewing. All running sessions stream simultaneously.
- **Session persistence across workspaces**: Sessions are visible and switchable from any workspace context. Switching active workspace does not hide or lose sessions from other workspaces.
- **Switch-back continuation**: When switching back to a previously viewed session, a new message is created that continues streaming from where the session is now (the old message may be kept as a snapshot or continue — TBD in design).
- **Refresh button**: A `[🔄 Refresh]` button added to the inline keyboard below session messages, allowing the user to manually pull the latest output buffer at any time.
- **Workspace independence**: A session remains alive as long as its origin workspace's container exists. Switching active workspace does not affect running sessions in other workspaces.

## Capabilities

### New Capabilities
- `persistent-session-streams`: Always-on Telegram message streaming for every active session, enabling concurrent live views of multiple sessions and seamless session switching across workspaces.
- `session-refresh-button`: `[🔄 Refresh]` inline keyboard button on session messages to manually re-read the current output buffer/xterm state.

### Modified Capabilities

None. No existing spec covers session streaming or Telegram message lifecycle.

## Impact

- **SessionService**: Needs to support multiple concurrent stream targets per session. The `ActiveSession` model may need stream subscription tracking.
- **StreamService**: Core rewrite — must support multiple concurrent live-editing streams simultaneously. Currently tracks one message per session; needs to track multiple (one original + switch-back messages).
- **Telegram UI**: Keyboard layout changes (add Refresh button). Session list shows all sessions across all workspaces.
- **WorkspaceService**: Workspace switching must not affect running sessions in other workspaces.
