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
