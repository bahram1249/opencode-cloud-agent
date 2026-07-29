## ADDED Requirements

### Requirement: WebSocket gateway for session terminal

The system SHALL expose a WebSocket gateway at `/gateway` that provides real-time bidirectional communication between the Mini App terminal (xterm.js) and the PTY running inside the workspace container.

#### Scenario: Connect to session terminal
- **WHEN** a client connects to the WebSocket gateway with valid initData and a session publicId
- **THEN** the server SHALL validate the initData
- **AND** verify the session exists and belongs to the authenticated user
- **AND** replay the full terminal buffer history to the client
- **AND** begin piping all subsequent PTY output to the client in real time

#### Scenario: Receive real-time terminal output
- **WHEN** the PTY produces output data
- **THEN** the server SHALL emit a `terminal:data` event to all connected clients for that session
- **AND** the raw data SHALL NOT be cleaned, stripped, or truncated (full ANSI passthrough)

#### Scenario: Send keyboard input to PTY
- **WHEN** a client emits a `terminal:input` event with text
- **THEN** the server SHALL call `SessionService.sendToSession()` or `SessionService.sendKey()` with the received text
- **AND** the text SHALL be written to the PTY

#### Scenario: Multiple clients per session
- **WHEN** multiple clients connect to the same session
- **THEN** all clients SHALL receive the same output
- **AND** all clients MAY send input to the PTY

#### Scenario: Session exit notification
- **WHEN** the session's PTY exits
- **THEN** the server SHALL emit a `terminal:exit` event with the exit code and duration
- **AND** the clients SHALL show the final status

### Requirement: WebSocket reconnection

The WebSocket gateway SHALL support client reconnection. On reconnect, the server SHALL replay the full terminal buffer to restore the client state.

#### Scenario: Reconnect replays buffer
- **WHEN** a client disconnects and reconnects to the same session
- **THEN** the server SHALL replay the full terminal buffer
- **AND** resume piping live output

### Requirement: WebSocket authentication

All WebSocket connections SHALL be authenticated using initData provided as a query parameter during the handshake.

#### Scenario: Authenticated WebSocket connection
- **WHEN** a client connects to `/gateway?initData=...&session=...`
- **THEN** the server SHALL validate the initData before allowing the connection
- **AND** reject the connection with a close code if validation fails

#### Scenario: Reject unauthenticated connection
- **WHEN** a client connects without valid initData
- **THEN** the server SHALL close the connection
