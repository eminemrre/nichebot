const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { test } = require('node:test');

function clearModule(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
}

function setupRuntime() {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-db-maint-'));
    const previousHome = process.env.NICHEBOT_HOME;
    process.env.NICHEBOT_HOME = tempHome;
    clearModule('../src/runtime/paths');
    clearModule('../src/db/maintenance');
    const paths = require('../src/runtime/paths');
    const maintenance = require('../src/db/maintenance');
    paths.ensureRuntimeDirs();
    return {
        tempHome,
        paths,
        maintenance,
        cleanup() {
            clearModule('../src/db/maintenance');
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

test('inspectDatabase returns missing state when db file does not exist', () => {
    const ctx = setupRuntime();
    try {
        const report = ctx.maintenance.inspectDatabase();
        assert.equal(report.exists, false);
        assert.equal(report.healthy, false);
        assert.equal(report.integrity, 'missing');
    } finally {
        ctx.cleanup();
    }
});

test('inspectDatabase returns healthy state for valid sqlite db', () => {
    const ctx = setupRuntime();
    try {
        const db = new Database(ctx.paths.dbPath);
        db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, content TEXT)');
        db.exec("INSERT INTO posts (content) VALUES ('hello')");
        db.close();

        const report = ctx.maintenance.inspectDatabase();
        assert.equal(report.exists, true);
        assert.equal(report.healthy, true);
        assert.equal(report.integrity.toLowerCase(), 'ok');
        assert.equal(typeof report.fileBytes, 'number');
    } finally {
        ctx.cleanup();
    }
});

test('optimizeDatabase runs successfully on valid db', () => {
    const ctx = setupRuntime();
    try {
        const db = new Database(ctx.paths.dbPath);
        db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, content TEXT)');
        db.exec("INSERT INTO posts (content) VALUES ('a')");
        db.close();

        const result = ctx.maintenance.optimizeDatabase();
        assert.equal(result.after.healthy, true);
        assert.equal(result.after.integrity.toLowerCase(), 'ok');
        assert.equal(typeof result.bytesReduced, 'number');
    } finally {
        ctx.cleanup();
    }
});
