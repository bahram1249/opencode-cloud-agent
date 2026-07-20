## Why

`telegram-command.handler.ts` is 1951 lines of entangled concerns — workspace CRUD, project management, git operations, session lifecycle, setup wizard, menu building, and callback routing all live in one file. Every change requires scrolling past unrelated logic, the callback dispatch is scattered across private methods, and it's hard to find where a specific command's logic lives. This hurts maintainability and makes onboarding slow.

## What Changes

- Split `TelegramCommandHandler` into focused domain handler files, each owning its state
- Extract menu builders into a shared pure-function module
- Extract callback utility helpers (`cb`, `parseCb`) into a shared utility
- Keep `TelegramCommandHandler` as a thin orchestrator that delegates to domain handlers
- Zero behavior changes — all public method signatures and message formats remain identical

## Capabilities

### New Capabilities

None — this is a pure structural refactoring with no new capabilities.

### Modified Capabilities

None — no spec-level requirements change. All behavior, message formats, and command interfaces stay identical.

## Impact

- **`src/modules/telegram/telegram-command.handler.ts`**: reduced from ~1951 lines to a thin orchestrator (~60 lines)
- **`src/modules/telegram/`**: new files added: `handlers/` directory with 5 domain handler files, `ui/` directory with menu builders, `utils/` directory with callback helpers
- **`src/modules/telegram/telegram.module.ts`**: new providers registered, no structural change to imports
- No other modules affected — the handler's public API is unchanged
