const assert = require('assert/strict');
const { test } = require('node:test');
const { extractVersionSection } = require('../src/release/changelog');

const SAMPLE = `# Changelog

## [Unreleased]
- _No changes yet._

## [1.3.0] - 2026-02-15

### Added
- item-a

## [1.2.0] - 2026-02-10

### Added
- item-b
`;

test('extractVersionSection returns matching changelog section', () => {
    const section = extractVersionSection(SAMPLE, '1.3.0');

    assert.equal(Boolean(section), true);
    assert.equal(section.startsWith('## [1.3.0] - 2026-02-15'), true);
    assert.equal(section.includes('item-a'), true);
    assert.equal(section.includes('item-b'), false);
});

test('extractVersionSection returns null when version is missing', () => {
    const section = extractVersionSection(SAMPLE, '9.9.9');
    assert.equal(section, null);
});

test('extractVersionSection accepts whitespace around version input', () => {
    const section = extractVersionSection(SAMPLE, ' 1.2.0 ');
    assert.equal(Boolean(section), true);
    assert.equal(section.startsWith('## [1.2.0] - 2026-02-10'), true);
});
