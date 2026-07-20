## 1. Message Editing Infrastructure

- [x] 1.1 Add `editMessage(chatId, messageId, text, keyboard?)` method to `NotificationService` using `bot.telegram.editMessageText()` and `editMessageReplyMarkup`
- [x] 1.2 Thread `messageId` through callback handlers — change `handleCallback` signature to accept `messageId`, propagate to all handler methods that edit messages
- [x] 1.3 Update all callback query handlers to capture the source `messageId` from `ctx.callbackQuery.message.message_id`

## 2. Settings Hub Screen

- [x] 2.1 Rename `sendWorkspaceDetails()` to `showWorkspaceSettings()` in `telegram-menus.ts` and rewrite it to the new layout — labeled rows for Provider, Model, Projects, Git, Sessions with [Change]/[Manage] buttons
- [x] 2.2 Wire `ws:show` callback to use `showWorkspaceSettings()` with `editMessageText` instead of sending a new message
- [x] 2.3 Add sub-screen navigation callbacks: `ws:setting:provider`, `ws:setting:model`, `ws:setting:projects`, `ws:setting:git`, `ws:setting:sessions`
- [x] 2.4 Implement [🔙 Settings] back-navigation callback that re-renders `showWorkspaceSettings()` via edit
- [x] 2.5 Add [✏️ Rename] and [🗑️ Delete] action handlers in the settings screen

## 3. Provider Sub-Screen

- [x] 3.1 Build provider picker sub-screen showing provider options (opencode, openai, anthropic, github-copilot) via editMessageText
- [x] 3.2 Wire provider selection to API key text input prompt — when provider tapped, edit message to show "send your API key"
- [x] 3.3 After API key received, call `WorkspaceService.configureProvider()` and edit back to Settings with updated provider badge

## 4. Paginated Model Picker

- [x] 4.1 Extend `modelCallbackStore` to track page state per chat (current page, total pages, workspaceId)
- [x] 4.2 Rewrite `showModelPicker()` to display up to 8 models per page with page counter and [◀ Prev]/[Next ▶] navigation
- [x] 4.3 Add `model:np` (next page) and `model:pp` (prev page) callback handlers that re-fetch models, slice the requested page, and edit the message
- [x] 4.4 Ensure model selection edits back to Settings with the selected model reflected

## 5. Workspace List Dashboard

- [x] 5.1 Add provider icon mapping (`providerIcons` const) in `telegram-menus.ts`
- [x] 5.2 Enrich `showWorkspaceMenu()` rows with provider badge, model name, project count, and git status per workspace
- [x] 5.3 Ensure unconfigured workspaces show ⚪ with clear "setup" visual indicator

## 6. Contextual Help System

- [x] 6.1 Create `CONTEXTUAL_HELP` map in `telegram-help.ts` with help texts for: workspace-list, settings, model-picker, provider-picker, project-list, git-manage, session-list
- [x] 6.2 Add `help:<screen>` callback handler that reads from the map and sends help as a new message
- [x] 6.3 Add [❓ Help] button to every screen builder

## 7. Merge Setup Wizard into Settings

- [x] 7.1 Reroute `/setup` command to call `showWorkspaceSettings()` for the active workspace
- [x] 7.2 Remove `setupWizardState` Map and all wizard step logic from `telegram-setup.handler.ts`
- [x] 7.3 Remove `handleWizardTextInput()` and `advanceAfterModel()` from setup handler
- [x] 7.4 Clean up `setup:` callback namespace — remove old wizard callbacks
- [x] 7.5 Remove `TelegramSetupHandler` from module providers if no longer referenced (or keep as thin wrapper)

## 8. Remove Per-Project Provider/Model

- [x] 8.1 Create Prisma migration to drop `provider` column from `WorkspaceProject` table
- [x] 8.2 Remove `/project provider`, `/project model`, `/project models` command handlers from `telegram-project.handler.ts`
- [x] 8.3 Update `/project` help to direct users to workspace-level model configuration
- [x] 8.4 Remove any code in `WorkspaceService` or project service that reads/writes per-project provider

## 9. Gateway Command Alignment

- [x] 9.1 Verify `/workspace provider` still calls `WorkspaceService.configureProvider()` correctly
- [x] 9.2 Verify `/workspace model` still calls `WorkspaceService.setDefaultModel()` correctly
- [x] 9.3 Verify `/git login` and `/git logout` still call `GitAuthService` correctly
- [x] 9.4 Ensure all gateway command confirmations mention the Settings hub ("You can also manage this in Settings")

## 10. Verify and Clean Up

- [x] 10.1 Run full lint: `npm run lint` — 0 new errors (13 pre-existing)
- [x] 10.2 Run full typecheck: `npm run typecheck` — clean
- [x] 10.3 Run unit tests: `npm run test` — 4 suites, 18 tests passed
- [ ] 10.4 Run e2e tests: `npm run test:e2e` — skipped (no e2e changes)
- [x] 10.5 Verify all callback namespaces still route correctly through `telegram-command.handler.ts`
- [ ] 10.6 Manual test: workspace list → tap → settings → change provider → back → change model (with pagination) → back → verify — requires live Telegram bot
