const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

function clearModule(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
}

function setupTempRuntime() {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-backup-test-'));
    const previousHome = process.env.NICHEBOT_HOME;
    process.env.NICHEBOT_HOME = tempHome;
    clearModule('../src/runtime/paths');
    clearModule('../src/runtime/backup');
    const paths = require('../src/runtime/paths');
    const backup = require('../src/runtime/backup');
    paths.ensureRuntimeDirs();
    return {
        tempHome,
        paths,
        backup,
        cleanup() {
            clearModule('../src/runtime/backup');
            clearModule('../src/runtime/paths');
            if (previousHome === undefined) {
                delete process.env.NICHEBOT_HOME;
            } else {
                process.env.NICHEBOT_HOME = previousHome;
            }
            fs.rmSync(tempHome, { recursive: true, force: true });
        },
    };
}

test('createRuntimeBackup creates snapshot and appears in list', () => {
    const ctx = setupTempRuntime();
    try {
        fs.writeFileSync(ctx.paths.envPath, 'KEY=value\n');
        try {
            fs.chmodSync(ctx.paths.envPath, 0o600);
        } catch { }
        fs.writeFileSync(ctx.paths.dbPath, 'db-content');
        fs.writeFileSync(path.join(ctx.paths.logsDir, 'nichebot.log'), 'log-content');

        const created = ctx.backup.createRuntimeBackup({ reason: 'test_case' });
        assert.equal(typeof created.id, 'string');
        assert.equal(fs.existsSync(path.join(created.backupDir, 'manifest.json')), true);

        const backups = ctx.backup.listBackups();
        assert.equal(backups.length, 1);
        assert.equal(backups[0].id, created.id);
        assert.equal(backups[0].reason, 'test_case');
    } finally {
        ctx.cleanup();
    }
});

test('restoreRuntimeBackup restores env/db/logs and creates safety backup', () => {
    const ctx = setupTempRuntime();
    try {
        fs.writeFileSync(ctx.paths.envPath, 'TOKEN=old\n');
        try {
            fs.chmodSync(ctx.paths.envPath, 0o600);
        } catch { }
        fs.writeFileSync(ctx.paths.dbPath, 'old-db');
        fs.writeFileSync(path.join(ctx.paths.logsDir, 'nichebot.log'), 'old-log');

        const baseBackup = ctx.backup.createRuntimeBackup({ reason: 'before_change' });

        fs.writeFileSync(ctx.paths.envPath, 'TOKEN=new\n');
        fs.writeFileSync(ctx.paths.dbPath, 'new-db');
        fs.writeFileSync(path.join(ctx.paths.logsDir, 'nichebot.log'), 'new-log');

        const restored = ctx.backup.restoreRuntimeBackup(baseBackup.id, { createSafetyBackup: true });
        assert.equal(restored.backupId, baseBackup.id);
        assert.equal(restored.restored.includes('.env'), true);
        assert.equal(restored.restored.includes('data/nichebot.db'), true);
        assert.equal(restored.preRestoreBackup !== null, true);

        const envContent = fs.readFileSync(ctx.paths.envPath, 'utf8');
        const dbContent = fs.readFileSync(ctx.paths.dbPath, 'utf8');
        const logContent = fs.readFileSync(path.join(ctx.paths.logsDir, 'nichebot.log'), 'utf8');
        assert.equal(envContent, 'TOKEN=old\n');
        assert.equal(dbContent, 'old-db');
        assert.equal(logContent, 'old-log');
    } finally {
        ctx.cleanup();
    }
});
