# NicheBot v1.2.0 Release Notes (Draft)

Release target: **v1.2.0**

## Highlights

- Terminal-first production workflow (`setup`, `doctor`, `start`)
- Runtime isolation with `~/.nichebot` and legacy migration support
- Strict startup validation and safer Telegram message fallback
- Native test suite + CI pipeline (Node 18/20)
- Production documentation and security/community governance files

## User-facing improvements

- Better first-run UX with interactive setup wizard
- Actionable validation errors with exact field + fix hints
- Stable config/data paths for global command usage
- Safer Markdown handling in Telegram responses

## Quality & ops improvements

- `npm run quality` as a single local quality gate
- GitHub Actions CI for lint + tests
- Issue templates and PR template
- Production runbook and checklist

## Breaking/contract changes

- `TELEGRAM_ALLOWED_USER_ID` is now mandatory for strict single-user operation.
- Runtime config defaults moved from repo root to `~/.nichebot`.

## Upgrade notes (from <=1.1.x)

1. Run `nichebot doctor` to inspect current state.
2. If old repo-root `.env` or DB exists, first `nichebot start` triggers one-time migration.
3. Verify runtime files under `~/.nichebot/`.
4. Re-run `nichebot doctor --json` and ensure `valid=true`.

## Tag & release plan

Use this exact sequence on `main`:

```bash
# 1) Clean working tree
git status

# 2) Quality gates
npm ci
npm run quality

# 3) Optional package sanity
npm pack --dry-run

# 4) Version bump (if releasing now)
npm version 1.2.0 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md docs/RELEASE_v1.2.0.md
git commit -m "release: v1.2.0"

# 5) Tag
git tag -a v1.2.0 -m "NicheBot v1.2.0"

# 6) Push
git push origin main
git push origin v1.2.0
```

## Post-release verification

- `nichebot doctor --json` on clean machine
- `nichebot setup` + `nichebot start` smoke run
- CI green on tag and `main`
