## Context

The codebase currently has two active main specs (`workspace-credentials`, `project-lifecycle`) located at `openspec/specs/`. Four additional capabilities (`container-workspace`, `git-operations`, `github-auth`, `project-sync`) are fully implemented in the codebase but only documented in archived delta specs under `openspec/changes/archive/`. This creates a gap where the main specs don't reflect the actual system behavior.

Additionally, some requirements in the active specs are incomplete or slightly misaligned with the implementation (e.g., missing git credential helper config, missing git status/diff operations).

## Goals / Non-Goals

**Goals:**
- Promote archived `container-workspace`, `git-operations`, and `project-sync` specs to live main specs
- Merge `github-auth` requirements into `workspace-credentials` (already partially covered)
- Update `workspace-credentials` and `project-lifecycle` specs to reflect current implementation

**Non-Goals:**
- No code changes — this is purely a documentation/specification alignment exercise
- No changes to the archived delta specs (kept for historical reference)
- No new feature design or implementation

## Decisions

1. **Promote archived specs as-is rather than rewriting** — The archived specs accurately describe the implemented behavior. Minor formatting changes may be needed (removing "ADDED" prefix headers) but content is correct.
2. **Delta spec approach** — Use the `## ADDED Requirements` format for new main specs and `## MODIFIED Requirements` for updates to existing main specs, following the spec-driven schema conventions.
3. **Merge github-auth into workspace-credentials** — The workspace-credentials spec already covers per-workspace GitHub OAuth. The archived github-auth spec covers tenant-level OAuth which was deprecated. Merging relevant parts avoids duplication.

## Risks / Trade-offs

- [Risk: Archived specs may have drifted from implementation] → Mitigation: Cross-reference each requirement against the actual code to validate accuracy
- [Risk: Main spec edits may conflict with future changes] → Mitigation: Use delta spec pattern so changes are traceable
