const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'cli.js');

function runCli(args, env = {}) {
    return spawnSync(process.execPath, [CLI, ...args], {
        cwd: ROOT,
        env: { ...process.env, ...env },
        encoding: 'utf8',
    });
}

test('cli backup and restore flow works end-to-end', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-backup-test-'));
    const envFile = path.join(tempHome, '.env');
    const dataDir = path.join(tempHome, 'data');
    const dbFile = path.join(dataDir, 'nichebot.db');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(envFile, 'STATE=old\n');
    try {
        fs.chmodSync(envFile, 0o600);
    } catch { }
    fs.writeFileSync(dbFile, 'db-old');

    const runtimeEnv = { NICHEBOT_HOME: tempHome };

    try {
        const backupResult = runCli(['backup', '--json'], runtimeEnv);
        assert.equal(backupResult.status, 0);
        const payload = JSON.parse(backupResult.stdout);
        assert.equal(typeof payload.id, 'string');

        fs.writeFileSync(envFile, 'STATE=new\n');
        fs.writeFileSync(dbFile, 'db-new');

        const restoreResult = runCli(['restore', payload.id, '--json'], runtimeEnv);
        assert.equal(restoreResult.status, 0);
        const restorePayload = JSON.parse(restoreResult.stdout);
        assert.equal(restorePayload.backupId, payload.id);

        const envAfter = fs.readFileSync(envFile, 'utf8');
        const dbAfter = fs.readFileSync(dbFile, 'utf8');
        assert.equal(envAfter, 'STATE=old\n');
        assert.equal(dbAfter, 'db-old');
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
