## Purpose

Project lifecycle management within a workspace: relative path model, path-based git clone, branch management with dirty-state handling, pull request creation via `gh` CLI, and automatic dependency installation. Per-project provider and model configuration is removed — model is workspace-level only.

## MODIFIED Requirements

### Requirement: Git credential check before project add with remote (MODIFIED)

The system SHALL check if the workspace has git credentials configured before allowing a project add with a remote URL. If no credentials are set, the system SHALL direct the user to configure them in the Settings hub.

#### Scenario: Add project with remote URL — no credentials
- **WHEN** user runs `/project add frontend . https://github.com/org/repo.git`
- **AND** the workspace has no `gitToken` set
- **THEN** the system SHALL warn the user
- **AND** SHALL display a message directing the user to the Settings hub to configure git credentials
- **AND** SHALL NOT proceed with the clone

#### Scenario: Add project with remote URL — has credentials
- **WHEN** user runs `/project add frontend . https://github.com/org/repo.git`
- **AND** the workspace has `gitToken` set
- **THEN** the system SHALL clone the repository using the workspace's git credentials

## REMOVED Requirements

### Requirement: Per-project provider and model commands

**Reason:** Model configuration is consolidated to workspace level only. Per-project `provider`, `model`, and `models` commands are removed to enforce a single source of truth.

**Migration:** Users configure the default model through the workspace Settings hub. All sessions and projects within the workspace use this model. The `/workspace model` command remains as a shortcut.
