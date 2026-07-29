## MODIFIED Requirements

### Requirement: Serve Mini App SPA from NestJS

The system SHALL serve a Telegram Mini App single-page application from the NestJS backend at `GET /mini-app`. The server SHALL validate one of three auth sources (Telegram WebApp initData, custom HMAC token with `ma_` prefix, or raw initData query parameter) before serving the page, and SHALL inject the validated auth string into the initial application state for subsequent API and WebSocket authentication.

#### Scenario: Serve Mini App with valid custom token
- **WHEN** a GET request is made to `/mini-app` with a valid `token` query parameter (prefix `ma_`)
- **THEN** the server SHALL validate the token's HMAC-SHA256 signature using the bot token
- **AND** decode the user ID from the token payload
- **AND** ensure a tenant exists for that user ID
- **AND** inject the token string into `window.__INITIAL_STATE__.initData` for subsequent API calls
- **AND** inject the `session` query param (if present) into `window.__INITIAL_STATE__.session` for auto-navigation
- **AND** return the SPA HTML

#### Scenario: Serve Mini App with valid initData query param
- **WHEN** a GET request is made to `/mini-app` with valid `initData` query parameter (Telegram-signed WebApp data)
- **THEN** the server SHALL validate the initData HMAC-SHA256 signature using the bot token
- **AND** inject the validated initData string into `window.__INITIAL_STATE__.initData`
- **AND** return the SPA HTML

#### Scenario: Serve Mini App with valid tgWebAppData query param
- **WHEN** a GET request is made to `/mini-app` with valid `tgWebAppData` query parameter (alternative name for Telegram WebApp data)
- **THEN** the server SHALL validate identically to initData
- **AND** inject the validated data string into `window.__INITIAL_STATE__.initData`
- **AND** return the SPA HTML

#### Scenario: Session param passed through to frontend
- **WHEN** a GET request is made to `/mini-app` with a `session` query parameter
- **THEN** the server SHALL include `session` in `window.__INITIAL_STATE__`
- **AND** the frontend SHALL auto-navigate to the session terminal

#### Scenario: Reject invalid auth
- **WHEN** a GET request is made to `/mini-app` with missing or invalid auth (no valid token, initData, or tgWebAppData)
- **THEN** the server SHALL return a 401 response with an authentication error page
