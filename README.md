<div align="center">

# NicheBot

**Self-hosted AI content assistant for Telegram-first workflows.**

Generate niche content, review it, and optionally publish to Twitter/X from one command-driven bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Overview](#overview) · [Quick Value in 5 Minutes](#quick-value-in-5-minutes) · [Key Features](#key-features) · [Architecture](#architecture-and-tech-stack) · [Quick Start](#quick-start) · [Deployment Status](#deployment-status) · [Commands](#telegram-commands)

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
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN` and one provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `DEEPSEEK_API_KEY`).
4. Run `npm start`.
5. In Telegram, send `/start`, then `/niche <topic>`, then `/uret`.

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
- At least one LLM API key
- Optional Twitter API credentials

### Local run

```bash
git clone https://github.com/eminemre35/nichebot.git
cd nichebot
npm install
cp .env.example .env
npm start
```

### Docker run

```bash
cp .env.example .env
docker compose up -d
docker compose logs -f
```

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

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

<div align="center">

Built for creators who need control, speed, and self-hosted flexibility.

</div>
