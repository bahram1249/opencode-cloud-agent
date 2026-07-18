## 1. Publish new main specs from archived delta specs

- [x] 1.1 Publish `container-workspace` spec: copy archived spec content to `openspec/specs/container-workspace/spec.md` (remove `## ADDED Requirements` header)
- [x] 1.2 Publish `git-operations` spec: copy archived spec content to `openspec/specs/git-operations/spec.md` (remove `## ADDED Requirements` header)
- [x] 1.3 Publish `project-sync` spec: copy archived spec content to `openspec/specs/project-sync/spec.md` (remove `## ADDED Requirements` header)

## 2. Update existing main specs

- [x] 2.1 Update `workspace-credentials` main spec: add git credential helper configuration requirement and credential isolation requirement from the change delta spec
- [x] 2.2 Update `project-lifecycle` main spec: add git status, diff, and log requirements; add dependency install configuration requirements from the change delta spec

## 3. Merge github-auth into workspace-credentials

- [x] 3.1 Merge relevant `github-auth` requirements (OAuth scoped per workspace, token revocation, scope validation) into `openspec/specs/workspace-credentials/spec.md`

## 4. Cleanup

- [x] 4.1 Verify all main specs match the current codebase implementation
- [x] 4.2 Run `openspec validate` to ensure spec integrity
