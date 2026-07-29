## 1. Config — Cross-platform workspace root default

- [x] 1.1 Update `app.config.ts` to compute platform-aware default `workspaceRoot` using `os.platform()` and `os.homedir()` instead of hardcoded `/workspace`
- [x] 1.2 Add `mkdirSync(root, { recursive: true })` during config bootstrap (or `OnModuleInit`) to ensure root directory exists at startup

## 2. Workspace service — UUID-based path creation

- [x] 2.1 In `workspace.service.create()`, generate `crypto.randomUUID()` before constructing the path
- [x] 2.2 Change path construction from `join(root, tenantId, name)` to `join(root, tenantId, wsId)`
- [x] 2.3 Pass the pre-generated UUID as the workspace `id` on `prisma.workspace.create()`
- [x] 2.4 Ensure `workDir` is set to the new UUID-based absolute path

## 3. Workspace service — Rename stability

- [x] 3.1 Remove `workDir` recompute and move logic from `workspace.service.update()` — path stays tied to UUID, not name

## 4. Container workspace delta

- [x] 4.1 Update `specs/container-workspace/spec.md` "Auto-assign host path" scenario to match new UUID-based path (`{workspaceRoot}/{tenantId}/{workspaceId}`)
- [x] 4.2 Verify `docker-workspace.service.ts` still receives `workDir` as the host path for volume mounts — confirmed, no code changes needed

## 5. Verify

- [x] 5.1 Run existing tests (`npm test`) to confirm no regressions — 18/18 passed, typecheck clean
- [ ] 5.2 Verify workspace creation works on macOS (with default path) — code path: `~/Library/Application Support/opencode-orchestrator/workspaces/{tid}/{uuid}`
- [ ] 5.3 Verify `WORKSPACE_ROOT` env var override still works for Docker compose deployments — code path: env var is checked first in `defaultWorkspaceRoot()`
