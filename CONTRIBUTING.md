# Contributing to NicheBot

Thank you for your interest in contributing! 🎉

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/eminemre35/nichebot/issues) first
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Node.js version and OS

### Suggesting Features

Open an issue with the `enhancement` label describing:
- What problem does it solve?
- Proposed solution
- Any alternatives considered

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test locally: `npm start`
5. Commit with clear messages: `git commit -m "feat: add Bluesky support"`
6. Push and open a PR

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Tests

### Adding a New Language

1. Copy `src/locales/en.json` to `src/locales/<lang>.json`
2. Translate all strings
3. Submit a PR

### Adding a New LLM Provider

1. Add config in `src/config.js`
2. Add provider case in `src/llm/provider.js`
3. Update `.env.example`
4. Update README

## Code Style

- Use `const` over `let` when possible
- Descriptive variable names
- JSDoc comments for public functions
- Handle errors gracefully

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
