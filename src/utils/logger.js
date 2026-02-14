const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'nichebot.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let currentLevel = LEVELS.info;

function init(level = 'info') {
    currentLevel = LEVELS[level] ?? LEVELS.info;
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    rotateIfNeeded();
}

function rotateIfNeeded() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                const rotated = `${LOG_FILE}.${Date.now()}.old`;
                fs.renameSync(LOG_FILE, rotated);
                // Son 3 eski log dosyasını tut
                const oldLogs = fs.readdirSync(LOG_DIR)
                    .filter(f => f.endsWith('.old'))
                    .sort()
                    .reverse();
                oldLogs.slice(3).forEach(f => {
                    try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch { }
                });
            }
        }
    } catch { }
}

function formatMessage(level, msg, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${ts}] [${level.toUpperCase()}] ${msg}${metaStr}`;
}

function writeLog(level, msg, meta) {
    if (LEVELS[level] > currentLevel) return;

    const formatted = formatMessage(level, msg, meta);

    // Console
    if (level === 'error') {
        console.error(formatted);
    } else if (level === 'warn') {
        console.warn(formatted);
    } else {
        console.log(formatted);
    }

    // File
    try {
        fs.appendFileSync(LOG_FILE, formatted + '\n');
        if (level === 'error') {
            fs.appendFileSync(ERROR_LOG, formatted + '\n');
        }
    } catch { }
}

// Hata loglarken API key sızmasını önle
function sanitize(msg) {
    if (typeof msg !== 'string') return String(msg);
    return msg
        .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***REDACTED***')
        .replace(/gho_[a-zA-Z0-9]{20,}/g, 'gho_***REDACTED***')
        .replace(/xai-[a-zA-Z0-9]{20,}/g, 'xai-***REDACTED***');
}

const logger = {
    init,
    error: (msg, meta) => writeLog('error', sanitize(msg), meta),
    warn: (msg, meta) => writeLog('warn', sanitize(msg), meta),
    info: (msg, meta) => writeLog('info', sanitize(msg), meta),
    debug: (msg, meta) => writeLog('debug', sanitize(msg), meta),
};

module.exports = logger;
