## 1. Fix `/git status` routing

- [x] 1.1 In `handleGitCmd`, add `case 'credential-status':` to the credential block (line ~658) so `/git credential-status` shows credentials
- [x] 1.2 Remove `status` from the credential match (line ~658) so `/git status` falls through to repo-status handler
- [x] 1.3 Add deprecation note in credential-status output: "Use /git credential-status to view credential info"

## 2. Fix setup wizard git credential parsing

- [x] 2.1 In the text input handler (`handleTextInput` around line 125), when `state.step === 'github-token'`, strip the `/git login ` prefix from the user's message before passing to the callback
- [x] 2.2 Fix `handleSetupCallback` `setup:githuntoken:done` case (line ~1684) to correctly parse `<username> <token> [url]` and pass to `setWorkspaceCredentials` with proper args
- [x] 2.3 Verify setup wizard properly accepts both formats (raw `username token url` and `/git login username token url`)

## 3. Update `/help` text

- [x] 3.1 Add missing sections: `/setup`, `Workspace Settings` subcommands (`provider`, `models`, `model`, `sync`, `rename`, `delete`, `github-token`)
- [x] 3.2 Expand `/project` section to include `branches`, `switch`/`checkout`, `install`, `provider`, `models`, `model`
- [x] 3.3 Add `/opencode` section clarifying it's an alias for `/send`
- [x] 3.4 Update `/git` section to reflect `/git credential-status` and ensure repo-status is correctly documented
- [x] 3.5 Fix formatting: remove trailing double-space on `/send` line

## 4. Update bot command descriptions

- [x] 4.1 Change `/opencode` description from "Send raw OpenCode command" to "Send text to active session (alias for /send)"
- [x] 4.2 Audit all command descriptions in `telegram-bot.service.ts` (`setMyCommands`) for accuracy against the updated help text

## 5. Clean up `help.txt`

- [x] 5.1 Rename `help.txt` to `docker-workspace-build.txt` or add a header comment clarifying it's a Docker build instruction
- [x] 5.2 Verify no code references `help.txt`

## 6. Verify

- [x] 6.1 Run `npm run lint` to check for lint errors (19 pre-existing errors, none in changed code)
- [x] 6.2 Run `npm run typecheck` to verify types
- [x] 6.3 Run `npm test` to verify existing tests pass (4 suites, 18 tests all passing)
