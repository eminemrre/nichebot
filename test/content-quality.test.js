const assert = require('assert/strict');
const { test } = require('node:test');
const {
    evaluateTweetQuality,
    evaluateThreadQuality,
} = require('../src/quality/content-quality');

test('evaluateTweetQuality returns allow for healthy output', () => {
    const result = evaluateTweetQuality({
        content: 'AI otomasyonunda küçük bir adım bile ekip verimini artırabiliyor. Siz bugün neyi otomatikleştirirdiniz?',
        hashtags: '#yapayzeka #otomasyon #verimlilik',
        recentContents: [],
    });

    assert.equal(result.action, 'allow');
    assert.equal(result.redFlags.length, 0);
    assert.equal(result.score >= 70, true);
});

test('evaluateTweetQuality blocks high-risk red flag content', () => {
    const result = evaluateTweetQuality({
        content: 'Bu yöntemle %100 garanti kazanç elde et. Hemen tıkla ve bana DM at.',
        hashtags: '#kazanc #firsat',
        recentContents: [],
    });

    const redFlagCodes = result.redFlags.map((flag) => flag.code);
    assert.equal(result.action, 'block');
    assert.equal(redFlagCodes.includes('GUARANTEED_RESULT_CLAIM'), true);
});

test('evaluateThreadQuality warns when structure is weak', () => {
    const result = evaluateThreadQuality({
        tweets: ['Sadece tek tweet.'],
        hashtags: '',
        recentContents: [],
    });

    assert.equal(result.action, 'warn');
    assert.equal(result.score < 70, true);
});
