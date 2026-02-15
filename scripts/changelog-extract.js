#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { extractVersionSection } = require('../src/release/changelog');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function normalizeVersion(input) {
    return String(input || '').trim().replace(/^v/i, '');
}

function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node scripts/changelog-extract.js <version>');
        process.exit(1);
    }

    const version = normalizeVersion(arg);
    if (!version) {
        console.error('Version cannot be empty.');
        process.exit(1);
    }

    const changelogText = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const section = extractVersionSection(changelogText, version);

    if (!section) {
        console.error(`Version section not found in CHANGELOG.md: ${version}`);
        process.exit(1);
    }

    process.stdout.write(`${section}\n`);
}

main();
