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
- [ ] `.env` file permissions restricted (600)
- [ ] Runtime home backed up regularly

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

## 7) Troubleshooting

- `nichebot doctor --json` for machine-readable diagnostics
- 401 Telegram error usually means wrong `TELEGRAM_BOT_TOKEN`
- Validation failures provide exact field + fix hint

## 8) Production checklist

- Full operational checklist: [`docs/PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md)
