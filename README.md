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
