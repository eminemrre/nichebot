# Production Checklist

Use this checklist before and after every production deployment.

## A) Pre-deploy

- [ ] `npm run quality` passes locally
- [ ] `nichebot doctor --json` reports `valid=true`
- [ ] `TELEGRAM_ALLOWED_USER_ID` is correct and verified
- [ ] Only one LLM provider is active with a valid API key
- [ ] Twitter keys are either fully configured or fully empty
- [ ] `.env` permissions are restricted (`chmod 600 ~/.nichebot/.env`)

## B) Service setup (systemd)

- [ ] Service file exists at `/etc/systemd/system/nichebot.service`
- [ ] `ExecStart` points to global binary (`.../nichebot start`)
- [ ] `NICHEBOT_HOME` is set explicitly in service environment
- [ ] Restart policy is enabled (`Restart=always`)
- [ ] Service enabled on boot

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nichebot
sudo systemctl restart nichebot
sudo systemctl status nichebot
journalctl -u nichebot -f
```

## C) Backup policy

Back up these paths:

- `~/.nichebot/.env` (encrypted at rest)
- `~/.nichebot/data/nichebot.db`
- `~/.nichebot/data/logs/`

Recommended schedule:

- [ ] DB snapshot: daily
- [ ] `.env` encrypted backup: on every secret change
- [ ] Restore drill: monthly

## D) Secret rotation policy

- [ ] Rotate Telegram token every 90 days (or immediately on leak)
- [ ] Rotate active LLM API key every 90 days
- [ ] Rotate Twitter credentials every 90 days (if enabled)
- [ ] Re-run `nichebot doctor` and smoke test after each rotation

Rotation flow:

1. Update secret in `~/.nichebot/.env`
2. Restart service: `sudo systemctl restart nichebot`
3. Validate: `nichebot doctor --json`
4. Send `/start` from authorized Telegram user and verify connection status

## E) Incident response quick checks

- [ ] 401 Telegram error -> verify `TELEGRAM_BOT_TOKEN`
- [ ] Validation fail -> run `nichebot setup` or fix field in runtime `.env`
- [ ] Unexpected publish failures -> verify Twitter full-key set
- [ ] Persistent runtime errors -> inspect `~/.nichebot/data/logs/error.log`
