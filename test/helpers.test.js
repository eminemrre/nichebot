const assert = require('assert/strict');
const { test } = require('node:test');
const { escapeMarkdown, stripMarkdownFormatting, sanitizeInput } = require('../src/utils/helpers');

test('escapeMarkdown escapes markdown-special characters', () => {
    const raw = 'hello_[world](test)`code`';
    const escaped = escapeMarkdown(raw);
    assert.equal(escaped, 'hello\\_\\[world\\]\\(test\\)\\`code\\`');
});

test('stripMarkdownFormatting removes markdown formatting tokens', () => {
    const mdText = '*Bold* _italic_ `code` [link](url)';
    const stripped = stripMarkdownFormatting(mdText);
    assert.equal(stripped, 'Bold italic code linkurl');
});

test('sanitizeInput removes dangerous chars and trims length', () => {
    const sanitized = sanitizeInput('  <hello>{world}  ', 10);
    assert.equal(sanitized, 'hellowo');
});
