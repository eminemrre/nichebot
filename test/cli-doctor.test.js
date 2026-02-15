const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'cli.js');

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
];

function baseEnv(extra = {}) {
    const env = { ...process.env, ...extra };
    ENV_KEYS.forEach((key) => delete env[key]);
    return env;
}

test('doctor --json succeeds with valid runtime env', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-valid-'));
    const envFile = path.join(tempHome, '.env');

    fs.writeFileSync(
        envFile,
        [
            'TELEGRAM_BOT_TOKEN=token',
            'TELEGRAM_ALLOWED_USER_ID=123456789',
            'LLM_PROVIDER=deepseek',
            'DEEPSEEK_API_KEY=key',
            'DEFAULT_LANGUAGE=en',
            'MAX_DAILY_POSTS=5',
            'LOG_LEVEL=info',
            'TZ=UTC',
            'NODE_ENV=production',
            '',
        ].join('\n')
    );

    try {
        const result = spawnSync(process.execPath, [CLI, 'doctor', '--json'], {
            cwd: ROOT,
            env: baseEnv({ NICHEBOT_HOME: tempHome }),
            encoding: 'utf8',
        });

        assert.equal(result.status, 0);
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.config.validation.valid, true);
        assert.equal(payload.runtime.envExists, true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('doctor --json fails when runtime env is missing', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-invalid-'));

    try {
        const result = spawnSync(process.execPath, [CLI, 'doctor', '--json'], {
            cwd: ROOT,
            env: baseEnv({ NICHEBOT_HOME: tempHome }),
            encoding: 'utf8',
        });

        assert.equal(result.status, 1);
        const payload = JSON.parse(result.stdout);
        const codes = payload.config.validation.errors.map((e) => e.code);
        assert.ok(codes.includes('MISSING_TELEGRAM_BOT_TOKEN'));
        assert.ok(codes.includes('MISSING_ALLOWED_USER_ID'));
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
