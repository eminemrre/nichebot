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
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
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

test('bootstrap succeeds when install/setup are skipped and doctor passes', async () => {
    clearModule('../src/runtime/bootstrap');
    const { runBootstrap } = require('../src/runtime/bootstrap');

    const result = await runBootstrap({
        skipInstall: true,
        skipSetup: true,
        skipDoctor: false,
        runDoctorReport: () => ({ config: { validation: { valid: true } } }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.steps[0].name, 'install');
    assert.equal(result.steps[0].status, 'skipped');
    assert.equal(result.steps[1].name, 'setup');
    assert.equal(result.steps[1].status, 'skipped');
    assert.equal(result.steps[2].name, 'doctor');
    assert.equal(result.steps[2].status, 'ok');
});

test('bootstrap fails in non-interactive mode when setup is required', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-bootstrap-test-'));
    const envSnapshot = snapshotEnv();
    process.env.NICHEBOT_HOME = tempHome;

    try {
        clearModule('../src/runtime/paths');
        clearModule('../src/config');
        clearModule('../src/runtime/bootstrap');

        const { runBootstrap } = require('../src/runtime/bootstrap');
        const result = await runBootstrap({
            skipInstall: true,
            skipDoctor: true,
            nonInteractive: true,
            canPromptUser: () => false,
        });

        assert.equal(result.ok, false);
        const setupStep = result.steps.find((step) => step.name === 'setup');
        assert.equal(Boolean(setupStep), true);
        assert.equal(setupStep.status, 'failed');
    } finally {
        clearModule('../src/runtime/bootstrap');
        clearModule('../src/config');
        clearModule('../src/runtime/paths');
        restoreEnv(envSnapshot);
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('bootstrap fails when doctor report is invalid', async () => {
    clearModule('../src/runtime/bootstrap');
    const { runBootstrap } = require('../src/runtime/bootstrap');

    const result = await runBootstrap({
        skipInstall: true,
        skipSetup: true,
        skipDoctor: false,
        runDoctorReport: () => ({ config: { validation: { valid: false } } }),
    });

    assert.equal(result.ok, false);
    const doctorStep = result.steps.find((step) => step.name === 'doctor');
    assert.equal(Boolean(doctorStep), true);
    assert.equal(doctorStep.status, 'failed');
});
