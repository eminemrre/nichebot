const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

function clearModule(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
}

test('runtime lock can be acquired and released by current process', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-lock-test-'));
    const previousHome = process.env.NICHEBOT_HOME;
    process.env.NICHEBOT_HOME = tempHome;

    try {
        clearModule('../src/runtime/paths');
        clearModule('../src/runtime/lock');
        const lock = require('../src/runtime/lock');

        const acquired = lock.acquireProcessLock();
        assert.equal(acquired.acquired, true);
        assert.equal(fs.existsSync(lock.lockPath), true);

        const status = lock.getLockStatus();
        assert.equal(status.exists, true);
        assert.equal(status.active, true);
        assert.equal(status.pid, process.pid);

        const released = lock.releaseProcessLock();
        assert.equal(released, true);
        assert.equal(fs.existsSync(lock.lockPath), false);
    } finally {
        clearModule('../src/runtime/lock');
        clearModule('../src/runtime/paths');
        if (previousHome === undefined) {
            delete process.env.NICHEBOT_HOME;
        } else {
            process.env.NICHEBOT_HOME = previousHome;
        }
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('runtime lock recovers stale lock file', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-lock-stale-'));
    const previousHome = process.env.NICHEBOT_HOME;
    process.env.NICHEBOT_HOME = tempHome;

    try {
        clearModule('../src/runtime/paths');
        const paths = require('../src/runtime/paths');
        paths.ensureRuntimeDirs();

        fs.writeFileSync(
            paths.lockPath,
            JSON.stringify({
                pid: 999999,
                startedAt: '2000-01-01T00:00:00.000Z',
                hostname: 'stale-host',
            })
        );

        clearModule('../src/runtime/lock');
        const lock = require('../src/runtime/lock');
        const result = lock.acquireProcessLock();

        assert.equal(result.acquired, true);
        assert.equal(result.staleLockRecovered, true);

        const status = lock.getLockStatus();
        assert.equal(status.active, true);
        assert.equal(status.pid, process.pid);

        lock.releaseProcessLock();
    } finally {
        clearModule('../src/runtime/lock');
        clearModule('../src/runtime/paths');
        if (previousHome === undefined) {
            delete process.env.NICHEBOT_HOME;
        } else {
            process.env.NICHEBOT_HOME = previousHome;
        }
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
