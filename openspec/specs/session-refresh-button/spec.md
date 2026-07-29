## Purpose

Every session stream message carries a `[🔄 Refresh]` button that lets the user manually pull the latest terminal buffer output at any time — even after the session has finished or the message has been frozen by a switch-back.

## Requirements

### Requirement: Refresh button on session messages

Every session stream message SHALL include a `[🔄 Refresh]` inline keyboard button that, when pressed, reads the current terminal buffer and re-edits the message with the latest content.

#### Scenario: Refresh shows latest output
- **WHEN** a user presses `[🔄 Refresh]` on a session message
- **THEN** the system SHALL read the current xterm buffer for that session
- **AND** edit the Telegram message with the latest content
- **AND** the message SHALL continue to receive live updates after the refresh

#### Scenario: Refresh on finished session
- **WHEN** a session's PTY has exited
- **AND** the user presses `[🔄 Refresh]`
- **THEN** the system SHALL read the final output buffer
- **AND** edit the message with the latest (final) content
- **AND** the message SHALL retain the "finished" status header

#### Scenario: Refresh on deleted entry
- **WHEN** a session message has been deleted by the user
- **AND** the user presses `[🔄 Refresh]`
- **THEN** the edit SHALL fail silently (Telegram returns error for deleted message)
- **AND** the entry SHALL be removed from the stream map

### Requirement: Keyboard layout includes refresh

The inline keyboard on all live session messages SHALL include `[🔄 Refresh]` alongside the existing key buttons.

#### Scenario: Default live keyboard
- **WHEN** a session is active
- **THEN** the inline keyboard SHALL be:
  - Row 1: `[↹ Tab]` `[↵ Enter]`
  - Row 2: `[⬆ Up]` `[⬇ Down]`
  - Row 3: `[🔄 Refresh]` `[✕ Ctrl+C]`

#### Scenario: Finished session keyboard
- **WHEN** a session has finished
- **THEN** all action buttons (Tab, Enter, Up, Down, Ctrl+C) SHALL be removed
- **AND** only `[🔄 Refresh]` SHALL remain

### Requirement: Refresh callback routing

The Telegram callback `sess:refresh` SHALL accept a stream entry identifier to target the specific message to refresh, not just the session.

#### Scenario: Refresh targets specific stream entry
- **WHEN** a session has multiple stream entries (original + switch-back)
- **AND** the user presses `[🔄 Refresh]` on one specific message
- **THEN** only that specific message SHALL be refreshed
- **AND** other stream entries for the same session SHALL NOT be affected

### Requirement: Mini App terminal is real-time

The Mini App terminal (xterm.js + WebSocket) SHALL receive PTY output in real time and does not require a manual refresh mechanism. The `[🔄 Refresh]` button is specific to the Telegram message-based streaming and SHALL NOT be replicated in the Mini App.

#### Scenario: Mini App does not need refresh
- **WHEN** a user views a session terminal in the Mini App
- **THEN** output SHALL stream in real time via WebSocket
- **AND** no manual refresh button or gesture SHALL be needed
- **AND** the existing `[🔄 Refresh]` button on Telegram messages SHALL continue to work as specified
