const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'cli.js');
const VALID_TEST_TELEGRAM_TOKEN = `123456789:${'A'.repeat(35)}`;

const ENV_KEYS = [
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
    'PROMPT_TEMPLATE_VERSION',
    'QUALITY_MIN_AUTO_PUBLISH_SCORE',
    'LOG_LEVEL',
    'TZ',
    'NODE_ENV',
    'OBSERVABILITY_ENABLED',
    'OBSERVABILITY_HOST',
    'OBSERVABILITY_PORT',
    'OBSERVABILITY_TOKEN',
];

function baseEnv(extra = {}) {
    const env = { ...process.env, ...extra };
    ENV_KEYS.forEach((key) => delete env[key]);
    return env;
}

test('bootstrap --skip-install --skip-setup succeeds with valid runtime env', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-bootstrap-'));
    const envFile = path.join(tempHome, '.env');

    fs.writeFileSync(
        envFile,
        [
            `TELEGRAM_BOT_TOKEN=${VALID_TEST_TELEGRAM_TOKEN}`,
            'TELEGRAM_ALLOWED_USER_ID=123456789',
            'LLM_PROVIDER=deepseek',
            'DEEPSEEK_API_KEY=test-key',
            'DEFAULT_LANGUAGE=en',
            'MAX_DAILY_POSTS=5',
            'PROMPT_TEMPLATE_VERSION=v1',
            'QUALITY_MIN_AUTO_PUBLISH_SCORE=65',
            'LOG_LEVEL=info',
            'TZ=UTC',
            'NODE_ENV=production',
            'OBSERVABILITY_ENABLED=true',
            'OBSERVABILITY_HOST=127.0.0.1',
            'OBSERVABILITY_PORT=9464',
            '',
        ].join('\n')
    );

    try {
        fs.chmodSync(envFile, 0o600);
    } catch { }

    try {
        const result = spawnSync(process.execPath, [CLI, 'bootstrap', '--skip-install', '--skip-setup', '--json'], {
            cwd: ROOT,
            env: baseEnv({ NICHEBOT_HOME: tempHome }),
            encoding: 'utf8',
        });

        assert.equal(result.status, 0);
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.ok, true);
        assert.equal(payload.steps.some((step) => step.name === 'doctor' && step.status === 'ok'), true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
