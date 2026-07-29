## ADDED Requirements

### Requirement: Mini App terminal is real-time

The Mini App terminal (xterm.js + WebSocket) SHALL receive PTY output in real time and does not require a manual refresh mechanism. The `[🔄 Refresh]` button is specific to the Telegram message-based streaming and SHALL NOT be replicated in the Mini App.

#### Scenario: Mini App does not need refresh
- **WHEN** a user views a session terminal in the Mini App
- **THEN** output SHALL stream in real time via WebSocket
- **AND** no manual refresh button or gesture SHALL be needed
- **AND** the existing `[🔄 Refresh]` button on Telegram messages SHALL continue to work as specified

## REMOVED Requirements

### Requirement: Refresh button on session messages (Mini App only)

**Reason**: The Mini App uses xterm.js with WebSocket for real-time streaming. Manual refresh is unnecessary because output arrives continuously. The Telegram bot retains the refresh button because its `editMessageText`-based streaming is asynchronous (debounced, potentially stale).

**Migration**: No migration needed. Mini App users see real-time output automatically. The `[🔄 Refresh]` button on Telegram messages remains functional for bot users.
