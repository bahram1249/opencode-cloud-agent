## Why

The existing main specs (`workspace-credentials`, `project-lifecycle`) are incomplete — they don't cover several implemented capabilities that currently only exist in archived delta specs (`container-workspace`, `git-operations`, `github-auth`, `project-sync`). We need to promote those archived specs into live main specs and update existing specs to match the actual codebase state.

## What Changes

- Promote archived `container-workspace` spec to a new main spec at `openspec/specs/container-workspace/spec.md`
- Promote archived `git-operations` spec to a new main spec at `openspec/specs/git-operations/spec.md`
- Promote archived `project-sync` spec to a new main spec at `openspec/specs/project-sync/spec.md`
- Add merged `github-auth` requirements into the existing `workspace-credentials` main spec (since workspace-credentials already covers per-workspace GitHub OAuth)
- Update `workspace-credentials` spec to match current implementation (git credential helper config, credential isolation)
- Update `project-lifecycle` spec to include git status/diff operations currently only in archived git-operations spec

## Capabilities

### New Capabilities
- `container-workspace`: Docker container lifecycle per workspace — create, start, stop, remove containers; environment variable injection; git credential configuration
- `git-operations`: Authenticated git operations inside workspace containers — clone, pull, push, commit, status, diff, log, path conversion
- `project-sync`: Automatic project synchronization — clone on add, sync on session create and container ensure

### Modified Capabilities
- `workspace-credentials`: Add git credential helper configuration requirement; clarify credential isolation enforcement
- `project-lifecycle`: Add git status/diff operations; align with current GitCommandsService implementation

## Impact

- New spec files under `openspec/specs/container-workspace/`, `openspec/specs/git-operations/`, `openspec/specs/project-sync/`
- Updated spec files under `openspec/specs/workspace-credentials/`, `openspec/specs/project-lifecycle/`
- No code changes — this is a spec-sync exercise only; all capabilities are already implemented
- Archived delta specs in `openspec/changes/archive/` remain as-is for historical reference
