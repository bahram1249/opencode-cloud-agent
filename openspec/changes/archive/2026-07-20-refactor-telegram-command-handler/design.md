## Context

`telegram-command.handler.ts` currently does everything: session lifecycle, workspace CRUD, project management, git operations, credential management, setup wizard, menu rendering, and callback routing — all 1951 lines in one class. It injects 6 services directly and maintains 3 in-memory state stores.

The Telegram module depends on this handler as the single orchestrator for all bot interactions. `TelegramBotService` calls public methods like `handleTextInput()`, `handleWorkspaceCmd()`, `handleCallback()`, etc.

## Goals / Non-Goals

**Goals:**
- Split into domain-focused handler files, each under ~300 lines
- Extract menu builders into pure functions (no DI needed)
- Extract utility helpers into a shared module
- Keep `TelegramCommandHandler` as a thin orchestrator that delegates
- Zero behavior changes — all public APIs, message formats, and keyboard layouts stay identical

**Non-Goals:**
- No new features
- No refactoring of the underlying services (WorkspaceService, SessionService, etc.)
- No changes to the Prisma schema or data model
- No changes to how TelegramBotService routes messages

## Decisions

### 1. Domain handler files, not a nested services hierarchy

**Decision:** Create 5 focused handler files under `handlers/`, each as an `@Injectable()` class with its own state. The main `TelegramCommandHandler` injects them and delegates.

**Why not a deeper service layer?** The current handler is the *only* consumer of the 6 injected services. Creating an abstract layer between them adds indirection without reuse benefit. Domain handlers inject the same services directly where needed.

### 2. Menus as exported functions, not injectable services

**Decision:** Extract all keyboard builders into `ui/telegram-menus.ts` as exported async functions. `telegram-help.ts` holds the help text constant.

**Why not injectable menu services?** Menu builders take data and return `Markup.inlineKeyboard(...)`. They're pure(ish) transformations — no DI needed. Exporting functions keeps them testable and avoids unnecessary providers.

### 3. Callback routing stays in the main handler

**Decision:** `handleCallback()` remains on `TelegramCommandHandler` as a thin switch that delegates to the appropriate domain handler.

**Why not a separate callback router?** The dispatch is a stable 9-case switch. A separate file would just re-export the same switch. Once it grows beyond ~20 routes, extract it.

### 4. State locality

Each domain handler owns its state rather than keeping everything in one class:
- **Session handler:** no persistent state (session state lives in `SessionService`)
- **Workspace handler:** `modelCallbackStore` + `modelCallbackCounter`
- **Project handler:** `pendingBranchSwitches`
- **Setup handler:** `setupWizardState`

### 5. `handleTextInput` routing

**Decision:** The main handler checks the setup wizard state first, then delegates to the session handler. This is the only "routing" that crosses domain boundaries and it's a single `if` check.

## File Structure

```
src/modules/telegram/
├── telegram-command.handler.ts    ← thin orchestrator (~60 lines)
├── telegram.module.ts             ← register new providers (+6)
│
├── handlers/
│   ├── telegram-session.handler.ts    ← start/send/cancel/sessions/key commands
│   ├── telegram-workspace.handler.ts  ← workspace CRUD + model picker + ws callbacks
│   ├── telegram-project.handler.ts    ← project CRUD + branch switching + proj callbacks
│   ├── telegram-git.handler.ts        ← git ops + credentials + git callbacks
│   └── telegram-setup.handler.ts      ← wizard state machine
│
├── ui/
│   ├── telegram-menus.ts              ← all keyboard builders (pure functions)
│   └── telegram-help.ts               ← help text constant
│
└── utils/
    └── telegram-callback.utils.ts     ← cb(), parseCb() pure functions
```

## Risks / Trade-offs

- **Risk:** Mistake in delegation routing could cause wrong handler to process a command. → **Mitigation:** Each delegation is a simple 1-line switch, easy to audit.
- **Risk:** Circular DI between domain handlers. → **Mitigation:** Handlers only inject shared services (NotificationService, WorkspaceService, etc.), never each other. The main handler is the only coordinator.
- **Risk:** `handleTextInput` needs to route to both setup and session handlers. → **Mitigation:** Single `if` check in the main handler; setup state is not shared.

## Migration Plan

1. Create utility files (`callback.utils.ts`, `menus.ts`, `help.ts`)
2. Create each domain handler file (one at a time, compile-check after each)
3. Strip `TelegramCommandHandler` down to orchestrator
4. Update `TelegramModule` providers
5. Run typecheck + lint to verify zero regressions
