const fs = require('fs');
const os = require('os');
const { lockPath, ensureRuntimeDirs } = require('./paths');

let lockOwnedByCurrentProcess = false;

function isPidRunning(pid) {
    const parsedPid = Number.parseInt(pid, 10);
    if (!Number.isSafeInteger(parsedPid) || parsedPid <= 0) return false;
    try {
        process.kill(parsedPid, 0);
        return true;
    } catch (error) {
        if (error.code === 'EPERM') return true;
        return false;
    }
}

function safeReadLockFile() {
    if (!fs.existsSync(lockPath)) return null;
    try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeLock(data) {
    fs.writeFileSync(lockPath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
}

function buildLockPayload() {
    return {
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
        command: process.argv.join(' '),
    };
}

function acquireProcessLock() {
    ensureRuntimeDirs();
    const payload = buildLockPayload();

    try {
        writeLock(payload);
        lockOwnedByCurrentProcess = true;
        return {
            acquired: true,
            lockPath,
            staleLockRecovered: false,
            existing: null,
        };
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }

    const existing = safeReadLockFile();
    const existingPid = Number.parseInt(existing?.pid, 10);
    const activeExisting = Number.isSafeInteger(existingPid) && existingPid > 0 && isPidRunning(existingPid);

    if (activeExisting && existingPid !== process.pid) {
        return {
            acquired: false,
            lockPath,
            staleLockRecovered: false,
            existing: existing || { pid: existingPid },
        };
    }

    try {
        fs.unlinkSync(lockPath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    writeLock(payload);
    lockOwnedByCurrentProcess = true;
    return {
        acquired: true,
        lockPath,
        staleLockRecovered: true,
        existing: existing || null,
    };
}

function releaseProcessLock() {
    if (!lockOwnedByCurrentProcess) return false;

    const existing = safeReadLockFile();
    const existingPid = Number.parseInt(existing?.pid, 10);

    if (Number.isSafeInteger(existingPid) && existingPid > 0 && existingPid !== process.pid) {
        lockOwnedByCurrentProcess = false;
        return false;
    }

    try {
        fs.unlinkSync(lockPath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    lockOwnedByCurrentProcess = false;
    return true;
}

function getLockStatus() {
    if (!fs.existsSync(lockPath)) {
        return {
            path: lockPath,
            exists: false,
            active: false,
            stale: false,
            pid: null,
            startedAt: null,
            hostname: null,
            ownedByCurrentProcess: false,
        };
    }

    const lock = safeReadLockFile();
    const pid = Number.parseInt(lock?.pid, 10);
    const active = Number.isSafeInteger(pid) && pid > 0 && isPidRunning(pid);
    const stale = !active;

    return {
        path: lockPath,
        exists: true,
        active,
        stale,
        pid: Number.isSafeInteger(pid) ? pid : null,
        startedAt: lock?.startedAt || null,
        hostname: lock?.hostname || null,
        ownedByCurrentProcess: active && pid === process.pid,
    };
}

module.exports = {
    lockPath,
    isPidRunning,
    acquireProcessLock,
    releaseProcessLock,
    getLockStatus,
};
