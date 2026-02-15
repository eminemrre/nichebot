const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function normalizeRelPath(filePath) {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function walkFilesRecursive(rootDir) {
    const files = [];
    if (!fs.existsSync(rootDir)) return files;

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));

        entries.forEach((entry) => {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(absolutePath);
                return;
            }
            if (!entry.isFile()) return;

            files.push(normalizeRelPath(path.relative(rootDir, absolutePath)));
        });
    }

    walk(rootDir);
    return files;
}

function captureManifestFiles(backupDir) {
    const allFiles = walkFilesRecursive(backupDir).filter((relPath) => relPath !== 'manifest.json');
    return allFiles.map((relPath) => {
        const absolutePath = path.join(backupDir, relPath);
        return {
            path: relPath,
            kind: 'file',
            bytes: sizeOf(absolutePath) || 0,
            sha256: sha256File(absolutePath),
        };
    });
}

function copyFileIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) return false;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    try {
        fs.chmodSync(destinationPath, 0o600);
    } catch { }
    return true;
}

function copyDirIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) return false;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    return true;
}

function getBackupDir(backupId) {
    return path.join(backupsDir, String(backupId || '').trim());
}

function getManifestPath(backupId) {
    return path.join(getBackupDir(backupId), 'manifest.json');
}

function sortBackups(backups) {
    return backups.sort((a, b) => String(b.id).localeCompare(String(a.id)));
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
        const files = Array.isArray(manifest?.files) ? manifest.files : [];
        return {
            id,
            path: getBackupDir(id),
            createdAt: manifest?.createdAt || null,
            reason: manifest?.reason || null,
            files,
            fileCount: files.length,
            totalBytes: Number(manifest?.totalBytes || 0),
            validManifest: Boolean(manifest),
        };
    });

    return sortBackups(backups);
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
    copyFileIfExists(envPath, path.join(backupDir, '.env'));
    copyFileIfExists(dbPath, path.join(backupDir, 'data', 'nichebot.db'));
    copyDirIfExists(logsDir, path.join(backupDir, 'data', 'logs'));

    const fileEntries = captureManifestFiles(backupDir);
    const totalBytes = fileEntries.reduce((sum, file) => sum + Number(file.bytes || 0), 0);

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
        fileCount: fileEntries.length,
        totalBytes,
        files: fileEntries,
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
    if (!Array.isArray(manifest.files)) {
        throw new Error(`Backup manifest files field is invalid: ${manifestPath}`);
    }
    return manifest;
}

function verifyBackup(backupId) {
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
    const issues = [];
    const warnings = [];
    let checkedFiles = 0;
    let checkedBytes = 0;

    const expectedPaths = new Set();

    manifest.files.forEach((file) => {
        const relPath = normalizeRelPath(file?.path);
        if (!relPath) {
            issues.push('Manifest contains file with empty path.');
            return;
        }
        expectedPaths.add(relPath);

        const absolutePath = path.join(backupDir, relPath);
        if (!fs.existsSync(absolutePath)) {
            issues.push(`Missing backup file: ${relPath}`);
            return;
        }

        const actualSize = sizeOf(absolutePath);
        if (Number.isFinite(Number(file.bytes)) && Number(file.bytes) !== actualSize) {
            issues.push(`File size mismatch: ${relPath}`);
        }

        const actualSha = sha256File(absolutePath);
        if (file.sha256 && String(file.sha256) !== actualSha) {
            issues.push(`File checksum mismatch: ${relPath}`);
        }

        checkedFiles += 1;
        checkedBytes += Number(actualSize || 0);
    });

    const currentFiles = captureManifestFiles(backupDir).map((entry) => entry.path);
    const unexpectedFiles = currentFiles.filter((relPath) => !expectedPaths.has(relPath));
    if (unexpectedFiles.length > 0) {
        warnings.push(`Unexpected files found in backup: ${unexpectedFiles.join(', ')}`);
    }

    return {
        backupId: normalizedBackupId,
        path: backupDir,
        valid: issues.length === 0,
        issues,
        warnings,
        checkedFiles,
        checkedBytes,
        manifestFileCount: manifest.files.length,
        manifest,
    };
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

    const verification = verifyBackup(normalizedBackupId);
    if (!verification.valid && !options.skipVerify) {
        throw new Error(`Backup integrity verification failed: ${verification.issues[0] || 'unknown issue'}`);
    }

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
        verification: {
            valid: verification.valid,
            checkedFiles: verification.checkedFiles,
            checkedBytes: verification.checkedBytes,
        },
        sourceManifest: verification.manifest,
        preRestoreBackup: preRestoreBackup
            ? {
                id: preRestoreBackup.id,
                path: preRestoreBackup.backupDir,
            }
            : null,
    };
}

function pruneBackups(options = {}) {
    const keepRaw = Number.parseInt(options.keep, 10);
    const keep = Number.isFinite(keepRaw) && keepRaw >= 0 ? keepRaw : 10;

    const backups = listBackups();
    const removable = backups.slice(keep);
    const removed = [];

    removable.forEach((backup) => {
        fs.rmSync(backup.path, { recursive: true, force: true });
        removed.push(backup.id);
    });

    return {
        keep,
        total: backups.length,
        removed,
        remaining: Math.max(0, backups.length - removed.length),
    };
}

module.exports = {
    backupsDir,
    listBackups,
    getLatestBackup,
    createRuntimeBackup,
    verifyBackup,
    restoreRuntimeBackup,
    pruneBackups,
};
