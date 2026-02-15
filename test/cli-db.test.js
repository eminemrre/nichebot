const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
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

test('cli db doctor returns non-zero when database is missing', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-db-missing-'));
    try {
        const result = runCli(['db', 'doctor', '--json'], { NICHEBOT_HOME: tempHome });
        assert.equal(result.status, 1);
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.exists, false);
        assert.equal(payload.integrity, 'missing');
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('cli db doctor and optimize work on valid database', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-db-ok-'));
    const dataDir = path.join(tempHome, 'data');
    const dbFile = path.join(dataDir, 'nichebot.db');
    fs.mkdirSync(dataDir, { recursive: true });

    const db = new Database(dbFile);
    db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, content TEXT)');
    db.exec("INSERT INTO posts (content) VALUES ('hello')");
    db.close();

    try {
        const doctor = runCli(['db', 'doctor', '--json'], { NICHEBOT_HOME: tempHome });
        assert.equal(doctor.status, 0);
        const doctorPayload = JSON.parse(doctor.stdout);
        assert.equal(doctorPayload.exists, true);
        assert.equal(doctorPayload.healthy, true);

        const optimize = runCli(['db', 'optimize', '--json'], { NICHEBOT_HOME: tempHome });
        assert.equal(optimize.status, 0);
        const optimizePayload = JSON.parse(optimize.stdout);
        assert.equal(optimizePayload.after.healthy, true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('cli db optimize is blocked while runtime lock is active', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-cli-db-lock-'));
    const dataDir = path.join(tempHome, 'data');
    const dbFile = path.join(dataDir, 'nichebot.db');
    fs.mkdirSync(dataDir, { recursive: true });
    const db = new Database(dbFile);
    db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, content TEXT)');
    db.close();

    const lockFile = path.join(tempHome, 'nichebot.lock');
    fs.writeFileSync(lockFile, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        hostname: 'test-host',
    }));

    try {
        const result = runCli(['db', 'optimize', '--json'], { NICHEBOT_HOME: tempHome });
        assert.equal(result.status, 1);
        assert.equal(result.stderr.includes('Cannot optimize while bot is running'), true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});
