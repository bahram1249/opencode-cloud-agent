## MODIFIED Requirements

### Requirement: WebSocket authentication

All WebSocket connections SHALL be authenticated using the `initData` query parameter during the handshake. The server SHALL accept the custom `ma_` prefixed token or Telegram WebApp initData. Input routing SHALL use the connected session ID (not the user's current session).

#### Scenario: Authenticated WebSocket connection with token
- **WHEN** a client connects to `/gateway?initData=ma_xxx&session=sessionId`
- **THEN** the server SHALL validate the token (HMAC + expiry)
- **AND** reject the connection if validation fails

#### Scenario: Keyboard input routed by connected session
- **WHEN** a client emits `terminal:input` while connected to a session
- **THEN** the server SHALL route the input to the PTY identified by the WebSocket connection's `sessionPublicId`
- **AND** NOT route by the user's current active session

#### Scenario: Error handling for input failures
- **WHEN** `sendToSession()` or `sendKey()` throws during `terminal:input` handling
- **THEN** the server SHALL catch the error and emit an `error` event to the connected client
- **AND** SHALL NOT produce unhandled promise rejections
