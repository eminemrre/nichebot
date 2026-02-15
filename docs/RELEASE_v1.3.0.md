# NicheBot v1.3.0 Release Notes (Draft)

Release target: **v1.3.0**

## Highlights

- Prompt template versioning + quality scoring + auto red-flag regeneration
- Security hardening pipeline (`security:scan`, `security:audit`, CodeQL, Dependabot)
- Runtime safety upgrades: single-instance lock, graceful stop, backup/restore lifecycle
- Operations maturity: backup integrity checks, retention pruning, DB doctor/optimize commands
- Release automation: tag-based GitHub release workflow with changelog-driven notes

## User-facing improvements

- Better output control with template versions and visible quality diagnostics
- Safer autopublish decisions with quality threshold guardrails
- New operational commands for backups and database maintenance:
  - `nichebot stop`
  - `nichebot backup`, `nichebot backup list`, `nichebot backup verify`, `nichebot backup prune`
  - `nichebot restore <id|--latest>`
  - `nichebot db doctor`, `nichebot db optimize`

## Platform and DevEx improvements

- CI now enforces release readiness checks before release flows
- Security workflow and dependency governance are active by default
- Changelog section can be extracted automatically for GitHub Releases

## Breaking / contract changes

- No new breaking changes introduced in `v1.3.0`.
- Existing strict access contract remains: `TELEGRAM_ALLOWED_USER_ID` is mandatory.

## Upgrade notes (from <=1.2.x)

1. Pull latest code and install dependencies.
2. Run `npm run quality:full` and `npm run security:full`.
3. Run `nichebot doctor` and check runtime health.
4. Optionally run `nichebot backup verify --latest` and `nichebot db doctor`.

## Tag & release plan

```bash
# 1) Validate
npm ci
npm run quality:full
npm run security:full
npm run release:check

# 2) Version/tag
npm version 1.3.0 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md docs/RELEASE_v1.3.0.md docs/GITHUB_RELEASE_v1.3.0.md docs/DEMO_SALES_TR.md .github/workflows/release.yml scripts/changelog-extract.js src/release/changelog.js
git commit -m "release: v1.3.0"
git tag -a v1.3.0 -m "NicheBot v1.3.0"

# 3) Publish
git push origin main
git push origin v1.3.0
```

## Post-release verification

- Tag pipeline `Release` workflow finishes successfully
- GitHub Release is created with changelog-based notes
- `nichebot doctor --json` returns valid on a clean machine
