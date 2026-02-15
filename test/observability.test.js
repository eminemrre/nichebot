const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const ENV_KEYS = [
    'NICHEBOT_HOME',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ALLOWED_USER_ID',
    'LLM_PROVIDER',
    'DEEPSEEK_API_KEY',
    'DEFAULT_LANGUAGE',
    'MAX_DAILY_POSTS',
    'LOG_LEVEL',
    'TZ',
    'NODE_ENV',
    'OBSERVABILITY_ENABLED',
    'OBSERVABILITY_HOST',
    'OBSERVABILITY_PORT',
    'OBSERVABILITY_TOKEN',
];

function clearModule(relativePath) {
    const absolute = path.join(ROOT, relativePath);
    delete require.cache[absolute];
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

function writeEnv(homeDir) {
    fs.writeFileSync(
        path.join(homeDir, '.env'),
        [
            'TELEGRAM_BOT_TOKEN=test-token',
            'TELEGRAM_ALLOWED_USER_ID=123456789',
            'LLM_PROVIDER=deepseek',
            'DEEPSEEK_API_KEY=test-key',
            'DEFAULT_LANGUAGE=en',
            'MAX_DAILY_POSTS=5',
            'LOG_LEVEL=error',
            'TZ=UTC',
            'NODE_ENV=test',
            'OBSERVABILITY_ENABLED=true',
            'OBSERVABILITY_HOST=127.0.0.1',
            'OBSERVABILITY_PORT=9464',
            '',
        ].join('\n')
    );
}

test('observability server exposes health and metrics with token auth', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-observability-test-'));
    const envSnapshot = snapshotEnv();
    process.env.NICHEBOT_HOME = tempHome;
    writeEnv(tempHome);

    clearModule('src/runtime/paths.js');
    clearModule('src/config.js');
    clearModule('src/observability/metrics.js');
    clearModule('src/observability/server.js');

    const config = require(path.join(ROOT, 'src/config.js'));
    config.reloadConfig({ override: true });

    const metrics = require(path.join(ROOT, 'src/observability/metrics.js'));
    metrics.incCounter('nichebot_commands_received_total', 'Total received bot commands', { command: 'start' }, 3);

    const { startObservabilityServer } = require(path.join(ROOT, 'src/observability/server.js'));
    const instance = startObservabilityServer({
        enabled: true,
        host: '127.0.0.1',
        port: 0,
        token: 'secret-token',
    });

    try {
        await instance.ready;
        const address = instance.server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const unauthorized = await fetch(`${baseUrl}/health`);
        assert.equal(unauthorized.status, 401);

        const healthRes = await fetch(`${baseUrl}/health`, {
            headers: { 'x-observability-token': 'secret-token' },
        });
        assert.equal(healthRes.status, 200);
        const healthPayload = await healthRes.json();
        assert.equal(healthPayload.status, 'ok');
        assert.equal(typeof healthPayload.scheduler.activeJobs, 'number');

        const metricsRes = await fetch(`${baseUrl}/metrics`, {
            headers: { authorization: 'Bearer secret-token' },
        });
        assert.equal(metricsRes.status, 200);
        const metricsText = await metricsRes.text();
        assert.equal(metricsText.includes('nichebot_process_start_time_seconds'), true);
        assert.equal(metricsText.includes('nichebot_commands_received_total'), true);
    } finally {
        await instance.close();
        clearModule('src/observability/server.js');
        clearModule('src/observability/metrics.js');
        clearModule('src/config.js');
        clearModule('src/runtime/paths.js');
        restoreEnv(envSnapshot);
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
