const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const ENV_KEYS = [
    'NICHEBOT_HOME',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ALLOWED_USER_ID',
    'LLM_PROVIDER',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_MODEL',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
    'DEFAULT_LANGUAGE',
    'MAX_DAILY_POSTS',
    'LOG_LEVEL',
    'TZ',
    'NODE_ENV',
];

function clearModule(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
}

function snapshotEnv() {
    const snapshot = {};
    ENV_KEYS.forEach((key) => {
        snapshot[key] = process.env[key];
        delete process.env[key];
    });
    return snapshot;
}

function restoreEnv(snapshot) {
    ENV_KEYS.forEach((key) => {
        if (snapshot[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = snapshot[key];
        }
    });
}

function withConfig(envText) {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-config-test-'));
    const envFile = path.join(tempHome, '.env');
    const envSnapshot = snapshotEnv();

    if (typeof envText === 'string') {
        fs.writeFileSync(envFile, envText);
    }

    process.env.NICHEBOT_HOME = tempHome;

    clearModule('../src/runtime/paths');
    clearModule('../src/config');
    const configModule = require('../src/config');
    configModule.reloadConfig({ override: true });

    return {
        configModule,
        cleanup() {
            clearModule('../src/config');
            clearModule('../src/runtime/paths');
            restoreEnv(envSnapshot);
            fs.rmSync(tempHome, { recursive: true, force: true });
        },
    };
}

test('validateConfig reports missing required fields', () => {
    const ctx = withConfig(null);

    try {
        const result = ctx.configModule.validateConfig();
        const codes = result.errors.map((e) => e.code);
        assert.equal(result.valid, false);
        assert.ok(codes.includes('MISSING_TELEGRAM_BOT_TOKEN'));
        assert.ok(codes.includes('MISSING_ALLOWED_USER_ID'));
        assert.ok(codes.includes('MISSING_LLM_API_KEY'));
    } finally {
        ctx.cleanup();
    }
});

test('validateConfig accepts a valid deepseek setup', () => {
    const ctx = withConfig(`
TELEGRAM_BOT_TOKEN=test-telegram-token
TELEGRAM_ALLOWED_USER_ID=123456789
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=test-deepseek-key
DEFAULT_LANGUAGE=en
MAX_DAILY_POSTS=5
LOG_LEVEL=info
TZ=UTC
NODE_ENV=production
`);

    try {
        const result = ctx.configModule.validateConfig();
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.ok(result.warnings.some((w) => w.code === 'TWITTER_DISABLED'));
    } finally {
        ctx.cleanup();
    }
});

test('validateConfig rejects partial twitter credentials', () => {
    const ctx = withConfig(`
TELEGRAM_BOT_TOKEN=test-telegram-token
TELEGRAM_ALLOWED_USER_ID=123456789
LLM_PROVIDER=openai
OPENAI_API_KEY=test-openai-key
TWITTER_API_KEY=partial-key
DEFAULT_LANGUAGE=tr
MAX_DAILY_POSTS=5
LOG_LEVEL=info
TZ=UTC
NODE_ENV=production
`);

    try {
        const result = ctx.configModule.validateConfig();
        const codes = result.errors.map((e) => e.code);
        assert.equal(result.valid, false);
        assert.ok(codes.includes('PARTIAL_TWITTER_CONFIG'));
    } finally {
        ctx.cleanup();
    }
});
