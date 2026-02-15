const fs = require('fs');
const path = require('path');
const {
    runtimeHome,
    envPath,
    dbPath,
    logsDir,
    backupsDir,
    ensureRuntimeDirs,
} = require('./paths');

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sizeOf(filePath) {
    try {
        return fs.statSync(filePath).size;
    } catch {
        return null;
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function copyFileIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) {
        return null;
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    try {
        fs.chmodSync(destinationPath, 0o600);
    } catch { }
    return {
        sourcePath,
        destinationPath,
        bytes: sizeOf(destinationPath),
        kind: 'file',
    };
}

function copyDirIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) {
        return null;
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    return {
        sourcePath,
        destinationPath,
        bytes: null,
        kind: 'directory',
    };
}

function getBackupDir(backupId) {
    return path.join(backupsDir, String(backupId || '').trim());
}

function getManifestPath(backupId) {
    return path.join(getBackupDir(backupId), 'manifest.json');
}

function listBackups() {
    ensureRuntimeDirs();
    if (!fs.existsSync(backupsDir)) return [];

    const entries = fs.readdirSync(backupsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    const backups = entries.map((id) => {
        const manifestPath = getManifestPath(id);
        const manifest = readJson(manifestPath);
        return {
            id,
            path: getBackupDir(id),
            createdAt: manifest?.createdAt || null,
            reason: manifest?.reason || null,
            files: Array.isArray(manifest?.files) ? manifest.files : [],
            validManifest: Boolean(manifest),
        };
    });

    backups.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return backups;
}

function createRuntimeBackup(options = {}) {
    const reason = String(options.reason || 'manual').trim();
    const backupId = String(options.backupId || nowStamp()).trim();

    ensureRuntimeDirs();
    const backupDir = getBackupDir(backupId);
    if (fs.existsSync(backupDir)) {
        throw new Error(`Backup already exists: ${backupId}`);
    }

    fs.mkdirSync(backupDir, { recursive: false, mode: 0o700 });
    const copiedFiles = [];

    const copiedEnv = copyFileIfExists(envPath, path.join(backupDir, '.env'));
    if (copiedEnv) copiedFiles.push({
        path: '.env',
        bytes: copiedEnv.bytes,
        kind: copiedEnv.kind,
    });

    const copiedDb = copyFileIfExists(dbPath, path.join(backupDir, 'data', 'nichebot.db'));
    if (copiedDb) copiedFiles.push({
        path: 'data/nichebot.db',
        bytes: copiedDb.bytes,
        kind: copiedDb.kind,
    });

    const copiedLogs = copyDirIfExists(logsDir, path.join(backupDir, 'data', 'logs'));
    if (copiedLogs) copiedFiles.push({
        path: 'data/logs',
        bytes: copiedLogs.bytes,
        kind: copiedLogs.kind,
    });

    const manifest = {
        id: backupId,
        createdAt: new Date().toISOString(),
        reason,
        runtimeHome,
        source: {
            envPath,
            dbPath,
            logsDir,
        },
        files: copiedFiles,
    };

    fs.writeFileSync(path.join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
        mode: 0o600,
    });

    return {
        ...manifest,
        backupDir,
    };
}

function getLatestBackup() {
    const backups = listBackups();
    return backups[0] || null;
}

function loadBackupManifest(backupId) {
    const manifestPath = getManifestPath(backupId);
    const manifest = readJson(manifestPath);
    if (!manifest) {
        throw new Error(`Backup manifest not found or invalid: ${manifestPath}`);
    }
    return manifest;
}

function restoreRuntimeBackup(backupId, options = {}) {
    const normalizedBackupId = String(backupId || '').trim();
    if (!normalizedBackupId) {
        throw new Error('Backup id is required.');
    }

    ensureRuntimeDirs();
    const backupDir = getBackupDir(normalizedBackupId);
    if (!fs.existsSync(backupDir)) {
        throw new Error(`Backup not found: ${normalizedBackupId}`);
    }

    const manifest = loadBackupManifest(normalizedBackupId);
    const preRestoreBackup = options.createSafetyBackup
        ? createRuntimeBackup({ reason: `pre_restore:${normalizedBackupId}` })
        : null;

    const restored = [];

    const backupEnvPath = path.join(backupDir, '.env');
    if (fs.existsSync(backupEnvPath)) {
        fs.copyFileSync(backupEnvPath, envPath);
        try {
            fs.chmodSync(envPath, 0o600);
        } catch { }
        restored.push('.env');
    }

    const backupDbPath = path.join(backupDir, 'data', 'nichebot.db');
    if (fs.existsSync(backupDbPath)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.copyFileSync(backupDbPath, dbPath);
        restored.push('data/nichebot.db');
    }

    const backupLogsPath = path.join(backupDir, 'data', 'logs');
    if (fs.existsSync(backupLogsPath)) {
        fs.rmSync(logsDir, { recursive: true, force: true });
        fs.cpSync(backupLogsPath, logsDir, { recursive: true });
        restored.push('data/logs');
    }

    return {
        backupId: normalizedBackupId,
        restored,
        sourceManifest: manifest,
        preRestoreBackup: preRestoreBackup
            ? {
                id: preRestoreBackup.id,
                path: preRestoreBackup.backupDir,
            }
            : null,
    };
}

module.exports = {
    backupsDir,
    listBackups,
    getLatestBackup,
    createRuntimeBackup,
    restoreRuntimeBackup,
};
