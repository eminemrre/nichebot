const fs = require('fs');
const os = require('os');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..', '..');
const defaultHome = path.join(os.homedir(), '.nichebot');
const runtimeHome = path.resolve(process.env.NICHEBOT_HOME || defaultHome);

const envPath = path.join(runtimeHome, '.env');
const dataDir = path.join(runtimeHome, 'data');
const dbPath = path.join(dataDir, 'nichebot.db');
const logsDir = path.join(dataDir, 'logs');
const lockPath = path.join(runtimeHome, 'nichebot.lock');

function ensureRuntimeDirs() {
    [runtimeHome, dataDir, logsDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

function findLegacyPaths() {
    const legacyEnvPath = path.join(packageRoot, '.env');
    const legacyDataDir = path.join(packageRoot, 'data');
    const legacyDbPath = path.join(legacyDataDir, 'nichebot.db');

    return {
        packageRoot,
        legacyEnvPath,
        legacyDbPath,
        legacyDataDir,
        hasLegacyEnv: fs.existsSync(legacyEnvPath),
        hasLegacyDb: fs.existsSync(legacyDbPath),
    };
}

module.exports = {
    packageRoot,
    runtimeHome,
    envPath,
    dataDir,
    dbPath,
    logsDir,
    lockPath,
    ensureRuntimeDirs,
    findLegacyPaths,
};
