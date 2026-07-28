## ADDED Requirements

### Requirement: Temp-file credential injection
The system SHALL inject credentials into Docker containers via temporary files written to `/tmp/opencode-creds-<uuid>` instead of environment variables passed to `docker exec -e`.

#### Scenario: Write credentials file into container
- **WHEN** a container is being ensured or a docker exec command is prepared
- **THEN** the system SHALL write a credentials file to `/tmp/opencode-creds-<uuid>` inside the container using `docker exec -i sh -c "cat > /tmp/opencode-creds-<uuid>"`
- **AND** SHALL set file permissions to `0o600`
- **AND** SHALL set the environment variable `CREDENTIALS_FILE=/tmp/opencode-creds-<uuid>` instead of individual `-e GIT_TOKEN=xxx` flags

#### Scenario: Credentials file format
- **WHEN** the credentials file is written inside the container
- **THEN** it SHALL contain `KEY=VALUE` lines for each credential
- **AND** SHALL include `GIT_TOKEN`, `GIT_USERNAME`, `GITHUB_TOKEN`, and any provider `*_API_KEY` values

#### Scenario: Cleanup after exec
- **WHEN** a docker exec command completes (success or failure)
- **THEN** the system SHALL remove the credentials file from the container via `docker exec <cid> rm -f /tmp/opencode-creds-<uuid>`

#### Scenario: GIT_ASKPASS script for git auth
- **WHEN** a git operation requires authentication inside the container
- **THEN** the system SHALL write a `GIT_ASKPASS` script to `/tmp/git-askpass.sh` that reads credentials from `$CREDENTIALS_FILE`
- **AND** SHALL set `GIT_ASKPASS=/tmp/git-askpass.sh` and `GIT_TERMINAL_PROMPT=0` in the environment
- **AND** SHALL NOT use the previous `sh -c "git config --global credential.helper ..."` shell injection pattern

#### Scenario: GIT_ASKPASS script behavior
- **WHEN** git invokes the askpass script with a prompt containing "Username"
- **THEN** the script SHALL output the value of `GIT_USERNAME` from the credentials file
- **WHEN** git invokes the askpass script with any other prompt
- **THEN** the script SHALL output the value of `GIT_TOKEN` from the credentials file

### Requirement: Dual-interface credential injection
Both the Telegram Bot (via `execInContainer`) and the Mini App (via REST API git operations) SHALL use the same secure temp-file injection mechanism.

#### Scenario: Bot git command uses GIT_ASKPASS
- **WHEN** a user runs `/git push` or `/git pull` via the Telegram Bot
- **THEN** the system SHALL write the GIT_ASKPASS script and credentials file before running the git command
- **AND** SHALL clean up both files after command completion

#### Scenario: Mini App git command uses GIT_ASKPASS
- **WHEN** a user pushes or pulls via the Mini App project detail page
- **THEN** the system SHALL write the GIT_ASKPASS script and credentials file before running the git command
- **AND** SHALL clean up both files after command completion
