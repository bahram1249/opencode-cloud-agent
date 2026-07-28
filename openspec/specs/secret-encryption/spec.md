## Purpose

Encrypt sensitive credential fields (`gitToken`, `apiKey`) at rest using AES-256-GCM with transparent Prisma middleware, ensuring secrets never appear in plaintext in the SQLite database file.

## Requirements

### Requirement: Encrypt secrets at rest
The system SHALL encrypt `gitToken` and `apiKey` fields on the `Workspace` Prisma model before writing to the database and decrypt them transparently on read, using AES-256-GCM with a key derived from the `ENCRYPTION_KEY` environment variable.

#### Scenario: Encrypt on write
- **WHEN** a new workspace is created with `apiKey` and `gitToken` fields
- **THEN** the Prisma middleware SHALL encrypt both fields using AES-256-GCM before the record is written to SQLite
- **AND** the raw string values SHALL NOT appear in the database file

#### Scenario: Decrypt on read
- **WHEN** an existing workspace record is read via `findUnique`, `findFirst`, or `findMany`
- **THEN** the Prisma middleware SHALL decrypt the `gitToken` and `apiKey` fields before returning the record
- **AND** all existing service code SHALL continue to work without modification

#### Scenario: Encryption key from environment
- **WHEN** the application starts
- **THEN** the system SHALL read `ENCRYPTION_KEY` from the environment
- **AND** SHALL fail fast with a clear error if the key is missing or not the correct length (32 bytes hex-encoded)

#### Scenario: Authenticated encryption with integrity
- **WHEN** encrypting a field
- **THEN** the system SHALL use AES-256-GCM which provides both confidentiality and integrity verification
- **AND** SHALL generate a unique 96-bit initialization vector (IV) for each encryption operation

### Requirement: Dual-interface credential encryption
Both the Telegram Bot and Mini App SHALL transparently use the encrypted credential storage without any UI changes for existing credential flows.

#### Scenario: Bot stores encrypted credentials
- **WHEN** a user runs `/git login <username> <token>` via the Telegram Bot
- **THEN** the token SHALL be encrypted by middleware before storage
- **AND** the bot SHALL display `Token: (encrypted)` in the credential status response

#### Scenario: Mini App stores encrypted credentials
- **WHEN** a user saves git credentials via the Mini App workspace settings
- **THEN** the token SHALL be encrypted by middleware before storage
- **AND** the Mini App SHALL display "Token encrypted at rest" in the credential status section
