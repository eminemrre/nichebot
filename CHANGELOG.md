# Changelog

All notable changes to NicheBot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] - 2026-02-15

### Added
- 🌍 Multi-language support (English + Turkish) with `/dil` command
- 🔒 Rate limiting (3s cooldown per command)
- 🛡 Input sanitization for all user inputs
- 📝 File-based logging with log rotation and API key redaction
- 🔄 Retry mechanism with exponential backoff for LLM and Twitter APIs
- 🐳 Docker support (Dockerfile + docker-compose.yml)
- 🔔 Scheduler notifications now sent to Telegram (not just console)
- ⚡ Graceful shutdown (DB, cron, polling)
- 🛑 Uncaught exception and unhandled rejection handlers
- 📋 CONTRIBUTING.md and CHANGELOG.md
- ⚙️ New config options: LOG_LEVEL, TZ, NODE_ENV

### Fixed
- 🐛 `getRecentPosts()` was broken — opened new DB on every call, never returned data
- 🐛 Anthropic provider created unused OpenAI client (memory leak)
- 🐛 Scheduler sent notifications to console instead of Telegram
- 🐛 Authorization check race condition in bot message handler
- 🐛 `MAX_DAILY_POSTS=abc` caused NaN (now defaults to 5)

### Changed
- Provider.js refactored: lazy singleton, cleaner Anthropic/OpenAI separation
- All console.log replaced with structured logger
- README completely rewritten for global audience with badges
- .env.example updated with all new settings and English docs

## [1.0.0] - 2026-02-14

### Added
- Initial release
- Telegram bot with 12+ commands
- Multi-LLM support (OpenAI, Anthropic Claude, DeepSeek)
- Twitter/X integration (tweet + thread posting)
- Profile analysis with AI-powered strategy suggestions
- Niche management system
- Cron-based auto-scheduling
- SQLite database with 5 tables
- Preview → Approve/Reject workflow
