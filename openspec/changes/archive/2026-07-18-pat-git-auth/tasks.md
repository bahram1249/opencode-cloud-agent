## 1. Database & Config Cleanup

- [x] 1.1 Rename `Workspace.githubToken` → `Workspace.gitToken` in Prisma schema
- [x] 1.2 Rename `Workspace.githubLogin` → `Workspace.gitUsername` in Prisma schema
- [x] 1.3 Remove `Tenant.githubToken`, `Tenant.githubLogin`, `Tenant.githubAvatar` from Prisma schema
- [x] 1.4 Generate and apply Prisma migration
- [x] 1.5 Remove `githubClientId` and `githubClientSecret` from `AppConfig` interface
- [x] 1.6 Remove `githubClientId` and `githubClientSecret` from `app.config.ts` registration
- [x] 1.7 Remove `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from `environment.validation.ts`
- [x] 1.8 Update `.env.example` — remove OAuth comments, document generic git credential flow

## 2. Rename GitHubAuth Module → GitAuth Module

- [x] 2.1 Rename `GitHubAuthService` → `GitAuthService` — strip OAuth methods, add `git ls-remote` validation
- [x] 2.2 Add `validateToken(remoteUrl, username, token)` method using `git ls-remote`
- [x] 2.3 Add `setWorkspaceCredentials(workspaceId, username, token)` method
- [x] 2.4 Add `removeCredentials(workspaceId)` method
- [x] 2.5 Add `getCredentialsStatus(workspaceId)` method returning masked token info
- [x] 2.6 Add `testCredentials(workspaceId)` method re-running `git ls-remote`
- [x] 2.7 Add token masking helper: `maskToken(token)` → first4 + `****` + last4
- [x] 2.8 Delete `GitHubAuthController` entirely
- [x] 2.9 Rename `GitHubAuthModule` → `GitAuthModule` — remove controller, remove NotificationModule

## 3. Update Workspace & Container Credential References

- [x] 3.1 Update `WorkspaceService.getWorkspaceCredentials()` — rename to `gitToken`/`gitUsername`, remove tenant fallback
- [x] 3.2 Update `WorkspaceService.create()` — rename field references to `gitToken`/`gitUsername`
- [x] 3.3 Update `DockerWorkspaceService.WorkspaceContainerSpec` — rename to `gitToken`/`gitUsername`
- [x] 3.4 Update `DockerWorkspaceService.configureGitCredentials()` — use `$GIT_USERNAME`/`$GIT_TOKEN`
- [x] 3.5 Update `DockerWorkspaceService.buildProviderEnv()` — set `GIT_TOKEN`/`GIT_USERNAME` plus `GITHUB_TOKEN`/`GITHUB_USER` aliases

## 4. Telegram Commands — Remove OAuth, Add Git Credential Commands

- [x] 4.1 Remove `handleLoginCmd()` from `TelegramCommandHandler`
- [x] 4.2 Remove `handleLogoutCmd()` from `TelegramCommandHandler`
- [x] 4.3 Remove `ws:ghlogin` callback handler from `handleWSCallback()`
- [x] 4.4 Add `handleGitLoginCmd()` — parse `username token [url]`, validate via `git ls-remote`, handle all 6 states with inline examples
- [x] 4.5 Add `handleGitLogoutCmd()` — clear credentials, show SUCCESS state with re-login example
- [x] 4.6 Add `handleGitStatusCmd()` — show current credential status with masked token
- [x] 4.7 Add `handleGitTestCmd()` — re-validate existing credentials, show result
- [x] 4.8 Wire new git credential sub-commands into `handleGitCmd()` switch statement

## 5. Implement Six UX States

- [x] 5.1 EMPTY state — "🔑 Git Credentials — Not configured" + links + example
- [x] 5.2 LOADING state — "⏳ Validating git credentials..." + masked remote URL display
- [x] 5.3 SUCCESS state — "✅ Git credentials verified!" + username, masked token, ref count, next-step examples
- [x] 5.4 ERROR state — "❌ Authentication failed" + categorized reason + corrected example
- [x] 5.5 EXPIRED state — auto-triggered on git 401/403, clears token, shows re-login example
- [x] 5.6 STATUS state — "🔍 Git Credential Status" + all info + `/git test`/`/git logout` options

## 6. Update Telegram Bot Registration & Help

- [x] 6.1 Remove `/login` command registration from `telegram-bot.service.ts`
- [x] 6.2 Remove `/logout` command registration from `telegram-bot.service.ts`
- [x] 6.3 Update `/git` command description in bot command list
- [x] 6.4 Remove `/login` and `/logout` routing from `telegram.service.ts`
- [x] 6.5 Update `handleHelp()` — replace `/login`/`/logout` with `/git login/logout/status/test` section with examples

## 7. Update Setup Wizard

- [x] 7.1 Remove `setup:github` callback path from `handleSetupCallback()`
- [x] 7.2 Update `setup:model` handler — always show "Enter Credentials" or "Skip"
- [x] 7.3 Update `setup:githuntoken:done` handler — use `setWorkspaceCredentials()`

## 8. Auto-Detect Expired Tokens in Git Operations

- [x] 8.1 Add `isGitAuthError()` helper to `GitAuthService`
- [x] 8.2 Update `handleGitCmd()` catch block — detect 401/403, clear credentials, notify
- [x] 8.3 EXPIRED state message shows re-login example

## 9. Update Module Imports & Tests

- [x] 9.1 Update `app.module.ts` — import `GitAuthModule` instead of `GitHubAuthModule`
- [x] 9.2 Update module refs in `telegram.module.ts` and all other imports
- [x] 9.3 Rewrite `github-auth.service.spec.ts` → `git-auth.service.spec.ts` with new tests
