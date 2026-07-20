## ADDED Requirements

### Requirement: All session messages stream live

For every active session, all Telegram messages associated with that session SHALL continue to receive live output updates regardless of which session the user is currently interacting with or which workspace is active.

#### Scenario: Concurrent live streams
- **WHEN** a user has two active sessions (Session A and Session B)
- **AND** the user switches from Session A to Session B
- **THEN** the Telegram message for Session A SHALL continue to update with new output
- **AND** the Telegram message for Session B SHALL update with new output

#### Scenario: Workspace switch preserves streams
- **WHEN** a user switches the active workspace
- **THEN** all existing session streams SHALL continue to update
- **AND** no session PTY SHALL be terminated

### Requirement: Switch-back creates new stream view

When a user switches to a session they have previously viewed, the system SHALL create a new Telegram message that begins streaming the session's current output. Existing messages for that session SHALL continue to stream.

#### Scenario: Switch back creates fresh message
- **WHEN** a user switches to a session they previously viewed
- **THEN** a new Telegram message SHALL be sent showing the session's current terminal state
- **AND** the new message SHALL be labeled as a continuation (e.g., "(continued)")
- **AND** the new message SHALL receive all subsequent output updates

#### Scenario: Old messages freeze on switch-back
- **WHEN** a new switch-back message is created for a session
- **THEN** ALL existing stream entries for that session SHALL freeze (stop receiving output updates)
- **AND** their inline keyboard SHALL change to only `[🔄 Refresh]`
- **AND** the user MAY press Refresh to manually pull the latest state from a frozen entry

### Requirement: Stream entries have three states

Every stream entry SHALL be in one of three states: `live` (actively streaming), `frozen` (snapshot, no updates), or `finished` (session ended). Only `live` entries SHALL receive automatic output updates.

#### Scenario: Frozen entry does not update
- **WHEN** a stream entry is frozen
- **THEN** `flush()` SHALL skip that entry
- **AND** the entry's keyboard SHALL show only `[🔄 Refresh]`
- **AND** the user MAY press Refresh to manually update the content

#### Scenario: Frozen becomes finished on session end
- **WHEN** a session's PTY exits
- **THEN** all entries (both `live` and `frozen`) SHALL transition to `finished`
- **AND** their keyboards SHALL remain `[🔄 Refresh]`
- **AND** the message header SHALL show the final status and duration

### Requirement: Multiple stream entries per session

The StreamService SHALL support multiple concurrent Telegram messages for a single session, each independently editable and independently refreshable.

#### Scenario: Stream entries tracked independently
- **WHEN** a session has multiple stream entries (e.g., original + switch-back)
- **AND** one entry's edit fails (e.g., message deleted)
- **THEN** the error SHALL be caught silently
- **AND** the failed entry SHALL be removed from the stream map
- **AND** other entries SHALL continue to update

#### Scenario: Session end updates all entries
- **WHEN** a session's PTY exits
- **THEN** ALL stream entries for that session SHALL be updated with final status, duration, and final output
- **AND** the inline keyboard on all entries SHALL be replaced with only `[🔄 Refresh]`
- **AND** the entries SHALL remain in the stream map (not deleted) for future refresh

### Requirement: Sessions cross workspace boundaries

The session list (`/sessions`) SHALL display all sessions for a user regardless of which workspace they belong to. Session switching SHALL be available from any workspace context.

#### Scenario: All sessions visible in any workspace
- **WHEN** a user has sessions in multiple workspaces
- **AND** the user runs `/sessions`
- **THEN** all sessions from all workspaces SHALL be listed
- **AND** each entry SHALL show its workspace name

#### Scenario: Switch session from different workspace
- **WHEN** a user is in Workspace A
- **AND** the user switches to a session that belongs to Workspace B
- **THEN** the switch SHALL succeed
- **AND** the PTY for that session SHALL continue running in Workspace B's container
