const assert = require('assert/strict');
const { test } = require('node:test');
const { getPromptTemplate } = require('../src/llm/templates');

test('getPromptTemplate returns v1 tweet template metadata', () => {
    const template = getPromptTemplate('tweet', 'v1');
    assert.equal(template.type, 'tweet');
    assert.equal(template.resolvedVersion, 'tweet-v1');
    assert.equal(template.fallbackUsed, false);

    const systemPrompt = template.buildSystemPrompt({
        nicheName: 'yapay zeka',
        tone: 'bilgilendirici',
        language: 'tr',
        profileContext: '',
        recentTexts: '',
    });
    assert.equal(systemPrompt.includes('Twitter/X'), true);
});

test('getPromptTemplate falls back to default when version is unknown', () => {
    const template = getPromptTemplate('thread', 'v999');
    assert.equal(template.type, 'thread');
    assert.equal(template.resolvedVersion, 'thread-v1');
    assert.equal(template.fallbackUsed, true);
});

test('getPromptTemplate throws for unknown template type', () => {
    assert.throws(() => getPromptTemplate('unknown', 'v1'), /Bilinmeyen prompt şablon tipi/);
});
