## 1. Utility extraction

- [x] 1.1 Create `utils/telegram-callback.utils.ts` with `cb()` and `parseCb()` pure functions
- [x] 2.1 Create `ui/telegram-help.ts` with the `HELP_TEXT` constant extracted from `handleHelp()`
- [x] 2.2 Create `ui/telegram-menus.ts` with all keyboard builder functions extracted from the handler

## 3. Domain handler files

- [x] 3.1 Create `handlers/telegram-session.handler.ts` — session lifecycle (start/send/cancel), key commands, session callbacks, text input routing
- [x] 3.2 Create `handlers/telegram-workspace.handler.ts` — workspace CRUD, model picker + callbacks, workspace callback handlers
- [x] 3.3 Create `handlers/telegram-project.handler.ts` — project CRUD, branch switching + callbacks, project callback handlers, `pendingBranchSwitches` state
- [x] 3.4 Create `handlers/telegram-git.handler.ts` — git commands, git credential handlers, git callback handlers
- [x] 3.5 Create `handlers/telegram-setup.handler.ts` — setup wizard state machine, `setupWizardState` state

## 4. Main handler and module wiring

- [x] 4.1 Strip `TelegramCommandHandler` down to thin orchestrator delegating to domain handlers
- [x] 4.2 Update `TelegramModule` to register all new handler providers
- [x] 4.3 Run `npm run typecheck` and `npm run lint` to verify zero regressions
