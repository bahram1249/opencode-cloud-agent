## Purpose

When the bot generates a Mini App link during an active session (`/mini-app?session=s-xxxx&token=ma_xxx`), opening that link SHALL land the user directly on the session terminal screen rather than the Dashboard.

## Requirements

### Requirement: Query param to hash-route mapping

The system SHALL parse the `session` URL query parameter on page load and translate it to a hash-based route navigation.

#### Scenario: Session param present
- **WHEN** the Mini App loads with `?session=s-xxxx` in the URL
- **THEN** the initial state SHALL include `session: "s-xxxx"`
- **AND** the frontend SHALL navigate to `#session/s-xxxx`

#### Scenario: No session param
- **WHEN** the Mini App loads without a `session` query parameter
- **THEN** the frontend SHALL render the default screen (Dashboard)

### Requirement: Session param passthrough

The `GET /mini-app` controller SHALL pass the `session` query parameter through to `window.__INITIAL_STATE__`.

#### Scenario: Session param in URL
- **WHEN** a GET request is made to `/mini-app?session=s-xxxx&token=ma_xxx`
- **THEN** the injected `window.__INITIAL_STATE__` SHALL contain `session: "s-xxxx"`

#### Scenario: No session param
- **WHEN** a GET request is made to `/mini-app?token=ma_xxx` (no session)
- **THEN** the injected `window.__INITIAL_STATE__` SHALL contain `session: undefined` or omit the field
