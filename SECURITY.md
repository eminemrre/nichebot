# Security Policy

## Supported Versions

Only the latest `main` branch and latest tagged release are actively supported.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately via:

- GitHub Security Advisories (preferred), or
- Email: `emin3619@gmail.com`

Include:

- Vulnerability description
- Reproduction steps / PoC
- Impact assessment
- Suggested mitigation (if available)

We aim to acknowledge reports within 72 hours and provide a remediation timeline after triage.

## Security Guidelines

- Never commit real API keys or bot tokens.
- Use `TELEGRAM_ALLOWED_USER_ID` in production.
- Rotate secrets immediately if leaked.
- Keep Node.js and dependencies updated.
- Keep runtime config permissions strict: `chmod 600 ~/.nichebot/.env`.
- If observability binds `0.0.0.0`, always set `OBSERVABILITY_TOKEN`.

## Automated Security Checks

- `npm run security:scan` -> repository secret pattern scan.
- `npm run security:audit` -> npm audit high/critical gate (allowlist-aware).
- `npm run security:full` -> runs scan + audit together.

GitHub workflows:

- `.github/workflows/security.yml` runs secret scan, dependency audit, and CodeQL.
- `.github/dependabot.yml` keeps npm/GitHub Actions dependencies updated weekly.
