<div align="center">

# 🤖 NicheBot

**AI-Powered Social Media Content Assistant**

Generate, preview, and auto-publish niche-specific content to Twitter/X — all from Telegram.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#-features) · [Quick Start](#-quick-start) · [Cross-Platform](#-cross-platform) · [Commands](#-telegram-commands) · [Docker](#-docker-deployment)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🧠 **Multi-LLM** | OpenAI, Anthropic Claude, DeepSeek — bring your own API key |
| 📊 **Profile Analysis** | Analyze any Twitter profile and get personalized content strategy |
| 🏷 **Niche Management** | Add multiple topic niches, each with custom tone |
| 📝 **Smart Generation** | AI-powered tweets & threads with duplicate prevention |
| 👀 **Preview Flow** | Preview → Edit → Approve/Reject before publishing |
| ⏰ **Auto-Scheduling** | Cron-based auto-posting at your preferred times |
| 🐦 **Twitter/X** | Direct tweet and thread publishing via API v2 |
| 🌍 **Multi-Language** | Bot interface in English & Turkish (extensible) |
| 🔒 **Secure** | Rate limiting, input sanitization, API key redaction in logs |
| 🐳 **Docker Ready** | One-command deployment with `docker compose up` |

## 📋 Requirements

- **Node.js 18+** (or Docker)
- **Telegram Bot Token** — get from [@BotFather](https://t.me/BotFather)
- **LLM API Key** — choose one: [OpenAI](https://platform.openai.com/api-keys) / [Anthropic](https://console.anthropic.com/) / [DeepSeek](https://platform.deepseek.com/)
- **Twitter API Keys** *(optional)* — [Developer Portal](https://developer.twitter.com/)

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/eminemre35/nichebot.git
cd nichebot

# Install
npm install

# Configure
cp .env.example .env
nano .env  # Add your API keys

# Run
npm start
```

Then open Telegram and send `/start` to your bot!

## 🐳 Docker Deployment

```bash
# Configure
cp .env.example .env
nano .env

# Run (builds + starts automatically)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

## 💻 Cross-Platform

NicheBot runs natively on **Windows**, **macOS**, and **Linux** — no Docker required.

### Windows
```batch
:: Double-click nichebot.bat or run:
nichebot.bat
```

### macOS / Linux
```bash
chmod +x nichebot.sh
./nichebot.sh
```

### Global Install (any OS)
```bash
npm install -g .
nichebot
```

> On first run, NicheBot auto-creates `.env` from the template and guides you through setup.

## 📱 Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + connection status |
| `/niche <topic>` | Add a content niche |
| `/nisler` | List active niches |
| `/sil <topic>` | Remove a niche |
| `/uret` | Generate a tweet + preview |
| `/uret <topic>` | Generate for specific niche |
| `/thread <count>` | Generate a thread (default: 4, max: 10) |
| `/onayla` | Approve and publish to Twitter |
| `/reddet` | Reject and regenerate |
| `/analiz <user>` | Analyze a Twitter profile |
| `/zamanlama <time>` | Set auto-post schedule (e.g., `09:00,18:00`) |
| `/zamanlama kapat` | Stop all scheduled posts |
| `/durum` | View statistics |
| `/dil <tr\|en>` | Change bot language |

## 🏗 Architecture

```
┌─────────────┐     ┌────────────┐     ┌──────────────────┐
│  Telegram    │────▶│  NicheBot  │────▶│  LLM Provider    │
│  (User)      │◀────│  Bot Core  │◀────│  OpenAI/Claude/  │
└─────────────┘     │            │     │  DeepSeek        │
                    │  ┌────────┐│     └──────────────────┘
                    │  │ SQLite ││
                    │  │  DB    ││     ┌──────────────────┐
                    │  └────────┘│────▶│  Twitter/X API   │
                    │  ┌────────┐│     │  v2              │
                    │  │ Cron   ││     └──────────────────┘
                    │  │Scheduler│
                    └──┴────────┘┘
```

## ⚙️ Configuration

See [`.env.example`](.env.example) for all available settings:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USER_ID` | ❌ | all | Restrict to single user |
| `LLM_PROVIDER` | ✅ | openai | `openai`, `anthropic`, `deepseek` |
| `OPENAI_API_KEY` | ✅* | — | Required if provider is openai |
| `TWITTER_API_KEY` | ❌ | — | Enables publishing |
| `DEFAULT_LANGUAGE` | ❌ | en | Bot language (`tr` or `en`) |
| `MAX_DAILY_POSTS` | ❌ | 5 | Auto-post daily limit |
| `LOG_LEVEL` | ❌ | info | `error`, `warn`, `info`, `debug` |
| `TZ` | ❌ | UTC | Timezone for scheduled posts |

## 🖥 VPS Deployment (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start NicheBot
pm2 start src/index.js --name nichebot

# Auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 monit
```

## 🔒 Security

- **User Authentication**: Only allowed Telegram user IDs can control the bot
- **Rate Limiting**: 3-second cooldown per command to prevent API abuse
- **Input Sanitization**: All user inputs are validated and sanitized
- **API Key Protection**: Keys are automatically redacted from log files
- **Retry Mechanism**: Exponential backoff on API failures

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT License](LICENSE) — use freely, modify, distribute.

---

<div align="center">

**Built with ❤️ for content creators worldwide**

⭐ Star this repo if you find it useful!

</div>
