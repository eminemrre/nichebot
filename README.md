<div align="center">

# NicheBot

**Self-hosted AI content assistant for Telegram-first workflows.**

Generate niche content, review it, and optionally publish to Twitter/X from one command-driven bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![CI](https://github.com/eminemrre/nichebot/actions/workflows/ci.yml/badge.svg)](https://github.com/eminemrre/nichebot/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Overview](#overview) · [Quick Value in 5 Minutes](#quick-value-in-5-minutes) · [Key Features](#key-features) · [Architecture](#architecture-and-tech-stack) · [Quick Start](#quick-start) · [Quality](#quality-gates) · [Deployment Status](#deployment-status) · [Commands](#telegram-commands)

</div>

---

## Overview

NicheBot is a Node.js Telegram bot for creators and operators who want a controlled, self-hosted content workflow.

It supports:

- niche/topic management,
- LLM-backed text generation,
- human approval before publish,
- optional Twitter/X posting,
- and time-based auto-post scheduling.

## Quick Value in 5 Minutes

1. Clone and install dependencies.
2. Run `npm link` once to enable the global `nichebot` command.
3. Run `nichebot setup` (interactive wizard).
4. Run `nichebot doctor` for preflight checks.
5. Run `nichebot start`.

## Key Features

- Multi-LLM support
: Use OpenAI, Anthropic, or DeepSeek with your own keys.

- Niche and tone control
: Keep separate content directions per topic.

- Review-before-publish flow
: Preview, approve, reject, and regenerate.

- Optional Twitter/X publishing
: Post tweets/threads through API credentials.

- Scheduling automation
: Define posting times with cron-based execution.

- Prompt quality guardrails
: Versioned prompt templates, quality scoring, and automatic red-flag checks.

- Operational safety
: Rate limiting, sanitized inputs, and secret redaction in logs.

## Architecture and Tech Stack

| Layer | Technology |
|---|---|
| Bot Runtime | Node.js |
| Chat Interface | Telegram Bot API |
| AI Providers | OpenAI / Anthropic / DeepSeek |
| Persistence | SQLite (`better-sqlite3`) |
| Scheduling | `node-cron` |
| Social Publishing | `twitter-api-v2` |
| Deployment | Native (Win/macOS/Linux) + Docker |

## Quick Start

### Requirements

- Node.js 18+ (or Docker)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Telegram numeric user id from [@userinfobot](https://t.me/userinfobot) (`TELEGRAM_ALLOWED_USER_ID` is mandatory)
- At least one LLM API key
- Optional Twitter API credentials

### Local terminal-first run (recommended)

```bash
git clone https://github.com/eminemrre/nichebot.git
cd nichebot
npm install
npm link
nichebot setup
nichebot doctor
nichebot start
```

If `nichebot` is not found after `npm link`, add your global npm bin to `PATH`:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

### Runtime paths

- Config: `~/.nichebot/.env`
- SQLite DB: `~/.nichebot/data/nichebot.db`
- Logs: `~/.nichebot/data/logs/`
- Backups: `~/.nichebot/backups/`
- Process lock: `~/.nichebot/nichebot.lock`
- Override runtime home: `NICHEBOT_HOME=/custom/path`
- Prompt template version: `PROMPT_TEMPLATE_VERSION` (default `v1`)
- Scheduler quality threshold: `QUALITY_MIN_AUTO_PUBLISH_SCORE` (default `65`)

### CLI commands

```bash
nichebot                # alias: nichebot start
nichebot setup          # interactive setup wizard
nichebot doctor         # validation report
nichebot doctor --json  # machine-readable report
nichebot start          # validate + start bot
nichebot stop           # stop running process using runtime lock
nichebot backup         # create runtime backup snapshot
nichebot backup list    # list backup snapshots
nichebot restore <id>   # restore backup snapshot
nichebot restore --latest
```

### Docker run

```bash
cp .env.example .env
docker compose up -d
docker compose logs -f
```

## Quality Gates

```bash
npm run lint
npm test
npm run test:e2e
npm run quality
npm run quality:full
npm run security:scan
npm run security:audit
npm run security:full
npm run release:check
```

- CI runs on Node 18 and Node 20.
- E2E suite uses Telegram/Twitter mocks and exercises real command flows.
- Security workflow runs secret scan, dependency audit (allowlist-aware), and CodeQL.
- Release readiness gate validates npm pack manifest, bin executable, and changelog structure.
- PR template, issue templates, and workflow checks are included.
- Production runbook: [`docs/PRODUCTION.md`](docs/PRODUCTION.md)
- Production checklist: [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md)
- Release notes draft: [`docs/RELEASE_v1.2.0.md`](docs/RELEASE_v1.2.0.md)

## Observability

If observability is enabled (`OBSERVABILITY_ENABLED=true`), NicheBot exposes:

- `GET /health` -> JSON service/runtime health
- `GET /ready` -> readiness response
- `GET /metrics` -> Prometheus-format metrics

Default binding:

- `OBSERVABILITY_HOST=127.0.0.1`
- `OBSERVABILITY_PORT=9464`

If exposed beyond localhost, set `OBSERVABILITY_TOKEN` and send it via:

- `x-observability-token: <token>`, or
- `Authorization: Bearer <token>`

## Deployment Status

| Target | Status | Notes |
|---|---|---|
| Local execution | Ready | Works on Windows, macOS, Linux |
| Docker deployment | Ready | `docker compose up -d` |
| Managed cloud | Self-hosted only | No vendor lock-in by default |

## Telegram Commands

| Command | Description |
|---|---|
| `/start` | Welcome and connection status |
| `/niche <topic>` | Add a niche |
| `/nisler` | List active niches |
| `/sil <topic>` | Remove a niche |
| `/uret` | Generate content with preview |
| `/uret <topic>` | Generate for a specific niche |
| `/thread <count>` | Generate a thread (default 4, max 10) |
| `/onayla` | Approve and publish |
| `/reddet` | Reject and regenerate |
| `/analiz <user>` | Analyze a Twitter profile |
| `/zamanlama <time>` | Set posting times (e.g. `09:00,18:00`) |
| `/zamanlama kapat` | Disable scheduling |
| `/durum` | Show usage stats |
| `/dil <tr|en>` | Change bot language |

## Roadmap

- Expand provider-level generation controls.
- Improve template packs for niche-specific output styles.
- Add richer admin observability for scheduled runs.

## Contributing

Contributions are welcome.

- Start with [CONTRIBUTING.md](CONTRIBUTING.md).
- Open an issue for behavior-changing proposals.
- Submit PRs with clear rationale and testing notes.
- Security process: [SECURITY.md](SECURITY.md)
- Community standards: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

<div align="center">

Built for creators who need control, speed, and self-hosted flexibility.

</div>
