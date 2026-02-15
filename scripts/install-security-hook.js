#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const gitDir = path.join(ROOT, '.git');
const hooksDir = path.join(gitDir, 'hooks');
const hookPath = path.join(hooksDir, 'pre-commit');

if (!fs.existsSync(gitDir)) {
    console.error('[security:install-hook] .git directory not found. Run inside a git repo.');
    process.exit(1);
}

if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
}

const hook = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'echo "[pre-commit] Running security:scan..."',
    'npm run security:scan',
    '',
].join('\n');

fs.writeFileSync(hookPath, hook, { mode: 0o755 });

console.log(`[security:install-hook] Installed: ${hookPath}`);
console.log('[security:install-hook] Pre-commit will run: npm run security:scan');
