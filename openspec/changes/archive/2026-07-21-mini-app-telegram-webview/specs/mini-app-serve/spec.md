## ADDED Requirements

### Requirement: Serve Mini App SPA from NestJS

The system SHALL serve a Telegram Mini App single-page application from the NestJS backend at `GET /mini-app`. The server SHALL validate Telegram WebApp initData before serving the page, and SHALL inject initial application state into the HTML.

#### Scenario: Serve Mini App with valid initData
- **WHEN** a GET request is made to `/mini-app` with valid `initData` query parameter
- **THEN** the server SHALL validate the initData HMAC-SHA256 signature using the bot token
- **AND** extract the Telegram user ID from the validated data
- **AND** ensure a tenant exists for that user ID (via existing `WorkspaceService.ensureTenant()`)
- **AND** return an HTML page containing:
  - A `<script>` tag with `window.__INITIAL_STATE__` containing serialized user ID, workspaces list, and active session info
  - A `<div id="app">` for the SPA to render into
  - A `<link>` to `styles.css`
  - A `<script>` tag to load xterm.js from CDN
  - A `<script>` tag to load `app.js`

#### Scenario: Reject invalid initData
- **WHEN** a GET request is made to `/mini-app` with missing or invalid `initData`
- **THEN** the server SHALL return a 401 response with an authentication error page

#### Scenario: Serve static assets
- **WHEN** a GET request is made to any path under `/mini-app/assets/`
- **THEN** the server SHALL serve the corresponding file from the static assets directory

### Requirement: Static assets structure

The Mini App frontend SHALL consist of exactly three source files: `index.html` (shell), `app.js` (all application logic), and `styles.css` (all styling). No build step, bundler, or framework SHALL be used.

#### Scenario: index.html structure
- **WHEN** the Mini App loads
- **THEN** the HTML SHALL contain: xterm.js CSS/JS from CDN, a mount point `<div id="app">`, a `<link>` to styles.css, and a `<script>` to app.js
- **AND** no additional external dependencies SHALL be loaded except xterm.js CDN

#### Scenario: No framework on client
- **WHEN** reviewing the Mini App frontend code
- **THEN** the code SHALL use only vanilla JavaScript (DOM APIs, fetch, addEventListener, hashchange)
- **AND** SHALL NOT import or depend on React, Vue, Angular, Lit, or any other framework
