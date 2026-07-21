## MODIFIED Requirements

### Requirement: Auth header precedence

The Mini App SHALL use the auth string (`initData`) from `window.__INITIAL_STATE__` as the primary authentication mechanism for REST API and WebSocket connections. The `window.Telegram.WebApp.initData` value SHALL be used only as a fallback when the server-provided state is empty.

#### Scenario: Use token from initial state
- **WHEN** the Mini App loads and `window.__INITIAL_STATE__.initData` contains a non-empty string
- **THEN** the app SHALL set `X-Telegram-Init-Data` header to that value for all API calls
- **AND** pass that value as the `initData` query param for WebSocket connections
- **AND** NOT use `window.Telegram.WebApp.initData`

#### Scenario: Fallback to Telegram WebApp initData
- **WHEN** `window.__INITIAL_STATE__.initData` is empty
- **AND** `window.Telegram.WebApp.initData` is available
- **THEN** the app SHALL use `window.Telegram.WebApp.initData` as the fallback auth string

### Requirement: Session auto-navigation from URL

When the Mini App page URL contains a `session` query parameter, the app SHALL auto-navigate to the terminal screen for that session after rendering the initial view.

#### Scenario: Auto-navigate on page load
- **WHEN** the Mini App loads and `window.__INITIAL_STATE__.session` contains a non-empty value
- **THEN** the app SHALL navigate to `#session/{sessionId}` after rendering the initial route

#### Scenario: No navigation when session param absent
- **WHEN** the Mini App loads without a `session` query parameter
- **THEN** the app SHALL render the default Dashboard screen

### Requirement: Model loading condition

The model dropdown SHALL load when a provider is configured on the workspace, not conditionally on project existence.

#### Scenario: Load models when provider is set
- **WHEN** the workspace settings screen renders and `ws.providerId` is non-empty
- **THEN** the app SHALL call the models API to populate the model dropdown

#### Scenario: No model loading when provider is not set
- **WHEN** the workspace settings screen renders and `ws.providerId` is empty
- **THEN** the app SHALL show a disabled dropdown indicating the provider must be configured first
