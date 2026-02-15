const { config, reloadConfig, validateConfig, formatValidationReport } = require('./config');
const logger = require('./utils/logger');
const { init: initI18n } = require('./utils/i18n');
const { initDatabase, closeDatabase, getSetting } = require('./db/database');
const { initBot, stopBot, getSchedulerNotifyFn } = require('./telegram/bot');
const { initTwitterClient } = require('./twitter/client');
const { startScheduler, stopAll } = require('./scheduler/cron');

console.log(`
╔══════════════════════════════════════╗
║         🤖 NicheBot v1.1.0          ║
║  AI Social Media Content Assistant  ║
╚══════════════════════════════════════╝
`);

reloadConfig();

// 1. Logger başlat
logger.init(config.logLevel);

// 2. Yapılandırmayı doğrula
const validation = validateConfig();

if (validation.warnings.length > 0) {
    validation.warnings.forEach((w) => {
        logger.warn(`${w.code}: ${w.message}`, {
            field: w.field,
            fix: w.fix,
        });
    });
}

if (!validation.valid) {
    validation.errors.forEach((e) => {
        logger.error(`${e.code}: ${e.message}`, {
            field: e.field,
            fix: e.fix,
        });
    });
    logger.error(formatValidationReport(validation));
    logger.error('Run "nichebot setup" to generate/update your runtime config.');
    process.exit(1);
}

// 3. Veritabanını başlat
initDatabase();

// 4. i18n başlat (kayıtlı dil varsa onu kullan)
const savedLanguage = getSetting('language', config.defaultLanguage);
initI18n(savedLanguage);

// 5. Twitter client'ı başlat (opsiyonel)
initTwitterClient();

// 6. Telegram botunu başlat
initBot();

// 7. Zamanlanmış görevleri başlat
const notifyFn = getSchedulerNotifyFn();
startScheduler(notifyFn || ((text) => logger.info(`Scheduler: ${text}`)));

logger.info('NicheBot is running! Send a message to your Telegram bot.');

// Graceful shutdown
function shutdown(signal) {
    logger.info(`Shutting down (${signal})...`);

    try {
        stopAll();       // Cron job'ları durdur
        stopBot();       // Telegram polling durdur
        closeDatabase(); // DB bağlantısını kapat
    } catch (err) {
        logger.error('Shutdown error', { error: err.message });
    }

    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Uncaught exception handler — bot çökmesini önle
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
});
