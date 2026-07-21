## Purpose

Establish the development convention requiring both UI interfaces (Telegram bot and Telegram Mini App) to receive equivalent changes. Neither interface is secondary.

## Requirements

### Requirement: AGENTS.md documents dual-interface development

The project root SHALL contain an `AGENTS.md` file that documents the development convention requiring both UI interfaces to receive equivalent changes.

#### Scenario: AGENTS.md exists at repo root
- **WHEN** the project repository is inspected
- **THEN** an `AGENTS.md` file SHALL exist at the repository root
- **AND** it SHALL contain a section documenting the dual-interface development requirement

### Requirement: Both interfaces must implement every feature

Every feature or bug fix SHALL be implemented in both the Telegram bot interface and the Telegram Mini App interface. Neither interface is secondary. Both SHALL remain functional throughout development.

#### Scenario: New feature requires both paths
- **WHEN** a new capability is added to the system
- **THEN** it SHALL be accessible through both the Telegram bot commands/inline keyboards AND the Mini App REST API and UI
- **AND** the implementation SHALL be considered incomplete if only one interface supports it

#### Scenario: Bug fix applies to both paths
- **WHEN** a bug is found in one interface
- **THEN** the developer SHALL check whether the same bug exists in the other interface
- **AND** both interfaces SHALL be fixed if the bug affects both

#### Scenario: Service-layer changes are single-touch
- **WHEN** a change only affects the service layer (shared code)
- **THEN** no dual-interface work is required
- **AND** the existing tests SHALL ensure both interfaces benefit from the fix

### Requirement: Code review enforces convention

Changes that modify one UI interface without the corresponding change in the other SHALL require explicit justification in the commit message or PR description.

#### Scenario: Single-interface change requires justification
- **WHEN** a commit or PR changes only the bot interface or only the Mini App interface
- **THEN** the commit message or PR description SHALL explain why the other interface does not need the change
- **AND** acceptable justifications include: the change is to an interface-specific implementation detail, the feature is inherently Telegram-specific or Web-specific, the other interface is temporarily disabled
