# OpenCode Orchestrator

Control [OpenCode CLI](https://opencode.ai) remotely using Telegram. Send natural-language requests, and the orchestrator executes them through OpenCode, runs tests, asks for approval, commits to git, pushes to GitHub, and reports progress back to Telegram.

## Architecture

```
Telegram Bot ──> TelegramModule ──> TaskModule ──> WorkflowModule (FSM)
                                         │              │
                                    Prisma (SQLite)     ├── OpenCodeModule (child_process)
                                                         ├── BuildModule (lint/test/build/typecheck)
                                                         ├── GitModule (diff/commit/push/tag)
                                                         └── NotificationModule ──> Telegram
```

### Modules

| Module | Responsibility |
|--------|---------------|
| **TelegramModule** | Receives updates, parses commands, sends progress, inline keyboards |
| **TaskModule** | Stores tasks, tracks status, persists logs, supports retry |
| **WorkflowModule** | FSM engine with 9 states, drives the full pipeline |
| **OpenCodeModule** | Runs OpenCode CLI via child_process, streams stdout/stderr, cancellation, timeout, concurrency |
| **GitModule** | Branch, diff, commit, push, tag, rollback |
| **BuildModule** | npm install, lint, typecheck, build, test |
| **NotificationModule** | Sends formatted messages + inline buttons to Telegram |
| **RepositoryModule** | Manages multiple repositories with per-repo commands and approval policy |
| **ConfigurationModule** | Global key/value configuration store |
| **PromptTemplateModule** | Reusable prompt templates with `{{variable}}` interpolation |
| **HealthModule** | Liveness/readiness endpoint at `/api/health` |

### Workflow States

```
Pending → Running → Coding → Testing → WaitingApproval → Committing → Pushing → Finished
                    │           │             │
                    └───────────┴─────────────┴──> Failed
                                                        ↓ (resume)
                                                     Pending
```

## Prerequisites

- Node.js 22+
- Redis 7+
- OpenCode CLI installed
- Git
- A Telegram bot token (from @BotFather)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd opencode-orchestrator
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your BOT_TOKEN, AUTHORIZED_USERS, etc.

# 3. Set up the database
npx prisma migrate dev --name init
npx prisma generate
npm run seed

# 4. Start Redis (via Docker or locally)
docker compose up redis -d

# 5. Run the app
npm run dev
```

## Docker

```bash
docker compose up -d
```

The app will be available at `http://localhost:3000` with:
- API at `/api/*`
- Swagger UI at `/api/docs`
- Health check at `/api/health`
- Telegram webhook at `/api/telegram/webhook`

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/new <prompt>` | Start a new task (e.g. `/new Fix issue #52`) |
| `/repos` | List registered repositories |
| `/status <taskId>` | Show status of a task |
| `/tasks` | List recent tasks |
| `/cancel <taskId>` | Cancel a running task |
| `/resume <taskId>` | Resume a failed task |
| `/logs <taskId>` | Get task logs (as file if large) |
| `/diff <taskId>` | Get git diff for a task |
| `/approve <taskId>` | Approve a waiting task |
| `/reject <taskId>` | Reject a waiting task |
| `/help` | Show help |

You can also send any natural-language text (without `/`) to create a new task.

Inline keyboard buttons (Approve/Reject) are sent automatically when a task reaches `WaitingApproval`.

## Configuration (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | (required) |
| `AUTHORIZED_USERS` | Comma-separated Telegram user IDs | (required) |
| `OPENCODE_PATH` | Path to OpenCode CLI binary | `opencode` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `GITHUB_TOKEN` | GitHub token for push operations | (optional) |
| `DEFAULT_REPOSITORY` | Default repo slug | (required) |
| `PORT` | HTTP port | `3000` |
| `WEBHOOK_DOMAIN` | Telegram webhook domain (empty = polling) | (empty) |
| `DATABASE_URL` | SQLite file path | `file:./dev.db` |
| `LOG_LEVEL` | Pino log level | `info` |
| `MAX_CONCURRENT_TASKS` | Max parallel OpenCode executions | `3` |
| `TASK_TIMEOUT_MS` | Per-task timeout (0 = none) | `1800000` |

## REST API

Swagger UI is available at `http://localhost:3000/api/docs`.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks` | List tasks |
| GET | `/api/tasks/:id` | Get a task |
| PATCH | `/api/tasks/:id/status` | Transition task state |
| POST | `/api/tasks/:id/retry` | Retry a task |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| GET | `/api/tasks/:id/logs` | Get task logs |
| GET | `/api/tasks/:id/executions` | Get task executions |
| POST | `/api/repositories` | Register a repository |
| GET | `/api/repositories` | List repositories |
| POST | `/api/prompt-templates` | Create a prompt template |
| POST | `/api/prompt-templates/render` | Render a template |
| GET | `/api/health` | Health check |

## Security

- **Command whitelist**: Only `opencode`, `npm`, `npx`, `node`, `git`, `pnpm`, `yarn`, `tsc` may be executed. Arbitrary shell commands from Telegram are never run.
- **Authorized users only**: Only Telegram user IDs in `AUTHORIZED_USERS` can interact with the bot.
- **No shell interpolation**: All child processes use `spawn`/`execFile` (no shell), preventing injection.
- **Repository path validation**: Repository paths are validated to exist on disk before use.

## Database Schema

```
Repository   →  id, slug, name, path, branch, build/test/lint/typecheck commands, approval policy
Task         →  id, publicId, prompt, status (FSM state), branch, commitSha, retryCount
TaskLog      →  id, taskId, level, message, meta (JSON)
Execution    →  id, taskId, stage, command, stdout, stderr, exitCode, durationMs
Configuration →  id, key, value, scope, repositoryId
PromptTemplate → id, name, template, variables, category
```

## Development

```bash
npm run dev          # Start with hot reload
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint + auto-fix
npm test             # Unit tests
npm run test:cov     # Coverage report
npm run test:e2e     # E2E tests
npx prisma studio    # Browse the database
```

## License

MIT

## Enterprise workspace runtime

Each Telegram user is treated as a tenant. Workspaces are tenant-scoped and can be backed by an isolated Docker container. The workspace path is mounted at `/workspace` inside the container, and OpenCode is executed there so sessions, git operations, and provider/model defaults are isolated per workspace.

OpenCode configuration follows the upstream CLI behavior: credentials can be supplied through provider environment variables or `opencode auth login`, the default model is stored in `opencode.json`, and models can be discovered with `opencode models [provider] --refresh`. The bot persists the selected provider/model on the workspace and writes an `opencode.json` into the workspace before starting sessions.

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORKSPACE_ROOT` | `/workspace` | Root directory where tenant workspace folders are created. |
| `WORKSPACE_IMAGE` | `opencode-cloud-agent/workspace:latest` | Docker image used for workspace runtime containers. |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker daemon socket used by the Docker workspace service. |
| `WORKSPACE_CONTAINERS_ENABLED` | `true` | Set to `false` to fall back to the host OpenCode binary. |

Build the workspace image with `docker build -f docker/opencode-workspace.Dockerfile -t opencode-cloud-agent/workspace:latest .`. To enable Docker orchestration, install `dockerode` in deployments that have access to your npm registry and mount the Docker socket into this API container. If `dockerode` is unavailable, the app logs a warning and falls back to the host OpenCode binary.

### Telegram-friendly workspace setup flow

1. Create or switch a workspace: `/workspace create <name> <path>` or `/workspace switch <name>`.
2. Add git projects manually as before: `/project add <name> <path>`. API callers can also provide `remoteUrl`; if the path is missing, the app clones it, including `gitPath: "."` for cloning into the workspace root.
3. Configure an OpenCode provider: `/workspace provider <provider-id> <api-key>`.
4. Pick a model from live OpenCode output: `/workspace models <provider-id>` and tap a model button. The selected model is persisted on the workspace and used as the default for new sessions.
5. Start a session by sending a prompt. Before OpenCode starts, the app ensures the workspace container is running and automatically syncs all enabled git projects: missing projects with a remote are cloned; clean existing repositories are pulled; dirty repositories are left untouched to protect user work.
