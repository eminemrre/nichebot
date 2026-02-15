const Database = require('better-sqlite3');
const { dbPath, ensureRuntimeDirs } = require('../runtime/paths');

function getCurrentTimestamp() {
    return new Date().toISOString();
}

function querySingleValue(database, sql, fallbackValue = null) {
    try {
        const row = database.prepare(sql).get();
        if (!row) return fallbackValue;
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
    } catch {
        return fallbackValue;
    }
}

function tableExists(database, tableName) {
    const row = database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(tableName);
    return Boolean(row?.name);
}

function getTableCountIfExists(database, tableName) {
    if (!tableExists(database, tableName)) return null;
    return querySingleValue(database, `SELECT COUNT(*) AS count FROM ${tableName}`, null);
}

function openReadOnlyDatabaseOrNull() {
    ensureRuntimeDirs();
    try {
        return new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch {
        return null;
    }
}

function inspectDatabase() {
    const openedAt = getCurrentTimestamp();
    const db = openReadOnlyDatabaseOrNull();
    if (!db) {
        return {
            checkedAt: openedAt,
            path: dbPath,
            exists: false,
            healthy: false,
            integrity: 'missing',
            journalMode: null,
            pageSize: null,
            pageCount: null,
            freePages: null,
            fileBytes: null,
            estimatedUsedBytes: null,
            tables: {},
        };
    }

    try {
        const integrityValue = String(querySingleValue(db, 'PRAGMA integrity_check', 'unknown'));
        const pageSize = Number(querySingleValue(db, 'PRAGMA page_size', 0)) || 0;
        const pageCount = Number(querySingleValue(db, 'PRAGMA page_count', 0)) || 0;
        const freePages = Number(querySingleValue(db, 'PRAGMA freelist_count', 0)) || 0;
        const fileBytes = pageSize * pageCount;
        const estimatedUsedBytes = Math.max(0, pageSize * (pageCount - freePages));

        return {
            checkedAt: openedAt,
            path: dbPath,
            exists: true,
            healthy: integrityValue.toLowerCase() === 'ok',
            integrity: integrityValue,
            journalMode: String(querySingleValue(db, 'PRAGMA journal_mode', 'unknown')),
            pageSize,
            pageCount,
            freePages,
            fileBytes,
            estimatedUsedBytes,
            tables: {
                niches: getTableCountIfExists(db, 'niches'),
                posts: getTableCountIfExists(db, 'posts'),
                schedules: getTableCountIfExists(db, 'schedules'),
                settings: getTableCountIfExists(db, 'settings'),
            },
        };
    } finally {
        db.close();
    }
}

function optimizeDatabase() {
    ensureRuntimeDirs();
    const before = inspectDatabase();
    if (!before.exists) {
        throw new Error(`Database not found: ${dbPath}`);
    }

    const db = new Database(dbPath, { readonly: false, fileMustExist: true });
    try {
        const checkpointRow = db.pragma('wal_checkpoint(TRUNCATE)')[0] || {};
        db.exec('VACUUM');
        db.exec('PRAGMA optimize');

        const after = inspectDatabase();
        return {
            optimizedAt: getCurrentTimestamp(),
            path: dbPath,
            checkpoint: {
                busy: Number(checkpointRow.busy || 0),
                log: Number(checkpointRow.log || 0),
                checkpointed: Number(checkpointRow.checkpointed || 0),
            },
            before,
            after,
            bytesReduced: Math.max(0, Number(before.fileBytes || 0) - Number(after.fileBytes || 0)),
            freePagesReduced: Math.max(0, Number(before.freePages || 0) - Number(after.freePages || 0)),
        };
    } finally {
        db.close();
    }
}

module.exports = {
    inspectDatabase,
    optimizeDatabase,
};
