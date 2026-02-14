const { validateConfig } = require('./config');
const { initDatabase } = require('./db/database');
const { initBot } = require('./telegram/bot');
const { initTwitterClient } = require('./twitter/client');
const { startScheduler } = require('./scheduler/cron');

console.log(`
╔══════════════════════════════════════╗
║         🤖 NicheBot v1.0.0          ║
║  AI Sosyal Medya İçerik Asistanı    ║
╚══════════════════════════════════════╝
`);

// 1. Yapılandırmayı doğrula
const validation = validateConfig();

if (validation.warnings.length > 0) {
    console.log('⚠️  Uyarılar:');
    validation.warnings.forEach((w) => console.log(`  ${w}`));
    console.log('');
}

if (!validation.valid) {
    console.error('❌ Yapılandırma hataları:');
    validation.errors.forEach((e) => console.error(`  ${e}`));
    console.error('\n📄 .env.example dosyasını .env olarak kopyalayıp doldurun:');
    console.error('   cp .env.example .env');
    process.exit(1);
}

// 2. Veritabanını başlat
initDatabase();

// 3. Twitter client'ı başlat (opsiyonel)
initTwitterClient();

// 4. Telegram botunu başlat
const bot = initBot();

// 5. Zamanlanmış görevleri başlat
startScheduler((text) => {
    // İlk mesaj gönderildiğinde chatId kaydedilecek
    // Şimdilik console'a yazdır
    console.log('📢 Scheduler bildirim:', text);
});

console.log('\n🚀 NicheBot çalışıyor! Telegram\'dan botunuza mesaj gönderin.');
console.log('   Durdurmak için: Ctrl+C\n');

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 NicheBot kapatılıyor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 NicheBot kapatılıyor...');
    process.exit(0);
});
