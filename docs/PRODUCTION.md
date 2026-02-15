# Production Runbook

## 1) Runtime requirements

- Node.js 18+
- Stable outbound access for:
  - Telegram Bot API
  - Selected LLM provider API
  - Optional Twitter API

## 2) Configure runtime home

Default runtime home:

- `~/.nichebot`

Optional override:

```bash
export NICHEBOT_HOME=/opt/nichebot
```

## 3) First setup

```bash
npm install
npm link
nichebot setup
nichebot doctor
```

## 4) Hardening checklist

- [ ] `TELEGRAM_ALLOWED_USER_ID` set to your own user id
- [ ] LLM key configured only for selected provider
- [ ] Twitter keys either fully configured or fully empty
- [ ] `PROMPT_TEMPLATE_VERSION` uses supported version (`v1`)
- [ ] `QUALITY_MIN_AUTO_PUBLISH_SCORE` is set (recommended: `65` or higher)
- [ ] `.env` file permissions restricted (600)
- [ ] Single-instance lock is healthy (`~/.nichebot/nichebot.lock`)
- [ ] Runtime home backed up regularly
- [ ] `npm run security:full` passes
- [ ] `npm run release:check` passes

## 5) Start strategy

Foreground:

```bash
nichebot start
```

Systemd example (`/etc/systemd/system/nichebot.service`):

```ini
[Unit]
Description=NicheBot Service
After=network.target

[Service]
Type=simple
User=emin
WorkingDirectory=/home/emin/nichebot
Environment=NICHEBOT_HOME=/home/emin/.nichebot
ExecStart=/home/emin/.npm-global/bin/nichebot start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nichebot
sudo systemctl start nichebot
sudo systemctl status nichebot
```

## 6) Backup

Back up:

- `~/.nichebot/.env` (encrypted)
- `~/.nichebot/data/nichebot.db`
- `~/.nichebot/data/logs/`

CLI snapshot flow:

```bash
nichebot backup
nichebot backup list
nichebot backup verify --latest
nichebot backup prune --keep 10
nichebot restore <backup-id>
```

## 7) Troubleshooting

- `nichebot doctor --json` for machine-readable diagnostics
- `nichebot db doctor --json` for SQLite integrity and storage stats
- `nichebot db optimize` for checkpoint + vacuum maintenance (only when bot is stopped)
- 401 Telegram error usually means wrong `TELEGRAM_BOT_TOKEN`
- Validation failures provide exact field + fix hint

## 8) Production checklist

- Full operational checklist: [`docs/PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md)

## 9) Observability endpoints

When enabled:

- `GET http://<host>:<port>/health`
- `GET http://<host>:<port>/ready`
- `GET http://<host>:<port>/metrics`

Defaults:

- Host: `127.0.0.1`
- Port: `9464`

If endpoint is externally reachable, set `OBSERVABILITY_TOKEN` and require token auth.
