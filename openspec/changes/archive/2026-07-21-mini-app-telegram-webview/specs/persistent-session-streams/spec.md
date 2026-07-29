## ADDED Requirements

### Requirement: WebSocket output channel

The system SHALL support a WebSocket output channel as a second delivery mechanism alongside the existing Telegram editMessage stream. Both channels SHALL operate concurrently for the same PTY session. Adding the WebSocket channel SHALL NOT alter the behavior of the existing Telegram streaming.

#### Scenario: Concurrent Telegram and WebSocket streams
- **WHEN** a session is running
- **AND** at least one Mini App client is connected via WebSocket
- **THEN** the PTY output SHALL be sent to both the Telegram StreamService (debounced, cleaned, 4K-limited) AND the WebSocket gateway (raw, real-time, unlimited)
- **AND** output delivery to one channel SHALL NOT affect delivery to the other

#### Scenario: WebSocket channel without Telegram
- **WHEN** a user opens the Mini App terminal for a session
- **THEN** the PTY output SHALL stream via WebSocket
- **AND** the Telegram message SHALL continue to update independently
- **AND** neither channel depends on the other

#### Scenario: StreamService unchanged
- **WHEN** the WebSocket gateway is active
- **THEN** the existing `StreamService` (Telegram message editing) SHALL continue operating exactly as before
- **AND** the session emitter (`.on('output', ...)`) SHALL have both the StreamService and the WebSocket gateway as subscribers
