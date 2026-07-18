## MODIFIED Requirements

### Requirement: Container environment injection

The container SHALL receive provider API keys and git credentials as environment variables. Git credentials SHALL use the generic names `GIT_TOKEN` and `GIT_USERNAME`. For backward compatibility, `GITHUB_TOKEN` and `GITHUB_USER` SHALL also be set with identical values.

#### Scenario: Git credentials in container env
- **WHEN** a workspace has `gitToken` and `gitUsername` set
- **AND** `ensureContainer()` is called
- **THEN** the container SHALL have `GIT_TOKEN=<gitToken>` and `GIT_USERNAME=<gitUsername>`
- **AND** SHALL also have `GITHUB_TOKEN=<gitToken>` and `GITHUB_USER=<gitUsername>` for backward compatibility

### Requirement: Git credential configuration on container start

The system SHALL configure git's credential helper inside the container to authenticate git operations. The helper SHALL use `$GIT_USERNAME` and `$GIT_TOKEN` as the primary credential source.

#### Scenario: Configure git auth on every container start
- **WHEN** a container starts or is ensured to be running
- **AND** the workspace has `gitUsername` and `gitToken` set
- **THEN** the system SHALL execute inside the container:
  `git config --global credential.helper '!f() { echo "username=$GIT_USERNAME"; echo "password=$GIT_TOKEN"; }; f'`
- **AND** SHALL configure this every time `ensureContainer()` is called, not just on first creation
