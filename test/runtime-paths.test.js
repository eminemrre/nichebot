const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

function clearModule(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
}

test('runtime paths honor NICHEBOT_HOME and create required directories', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-paths-test-'));
    const previousHome = process.env.NICHEBOT_HOME;
    process.env.NICHEBOT_HOME = tmpHome;

    try {
        clearModule('../src/runtime/paths');
        const paths = require('../src/runtime/paths');

        assert.equal(paths.runtimeHome, tmpHome);
        assert.equal(paths.envPath, path.join(tmpHome, '.env'));
        assert.equal(paths.dataDir, path.join(tmpHome, 'data'));
        assert.equal(paths.dbPath, path.join(tmpHome, 'data', 'nichebot.db'));
        assert.equal(paths.logsDir, path.join(tmpHome, 'data', 'logs'));
        assert.equal(paths.backupsDir, path.join(tmpHome, 'backups'));
        assert.equal(paths.lockPath, path.join(tmpHome, 'nichebot.lock'));

        paths.ensureRuntimeDirs();
        assert.equal(fs.existsSync(paths.runtimeHome), true);
        assert.equal(fs.existsSync(paths.dataDir), true);
        assert.equal(fs.existsSync(paths.logsDir), true);
        assert.equal(fs.existsSync(paths.backupsDir), true);
    } finally {
        clearModule('../src/runtime/paths');
        if (previousHome === undefined) {
            delete process.env.NICHEBOT_HOME;
        } else {
            process.env.NICHEBOT_HOME = previousHome;
        }
        fs.rmSync(tmpHome, { recursive: true, force: true });
    }
});

test('findLegacyPaths returns expected shape', () => {
    const paths = require('../src/runtime/paths');
    const legacy = paths.findLegacyPaths();

    assert.equal(typeof legacy.packageRoot, 'string');
    assert.equal(typeof legacy.legacyEnvPath, 'string');
    assert.equal(typeof legacy.legacyDbPath, 'string');
    assert.equal(typeof legacy.hasLegacyEnv, 'boolean');
    assert.equal(typeof legacy.hasLegacyDb, 'boolean');
});
