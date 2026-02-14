const cron = require('node-cron');
const { generateTweet } = require('../llm/generator');
const { postTweet } = require('../twitter/client');
const db = require('../db/database');
const { config, isTwitterConfigured } = require('../config');

const activeJobs = new Map();

/**
 * Zamanlanmış görevleri başlat
 * @param {Function} notifyFn - Telegram'a bildirim gönderme fonksiyonu
 */
function startScheduler(notifyFn) {
    const schedules = db.getActiveSchedules();

    schedules.forEach((schedule) => {
        scheduleJob(schedule, notifyFn);
    });

    console.log(`✅ ${schedules.length} zamanlanmış görev başlatıldı`);
}

/**
 * Tek bir görev planla
 */
function scheduleJob(schedule, notifyFn) {
    if (activeJobs.has(schedule.id)) {
        activeJobs.get(schedule.id).stop();
    }

    if (!cron.validate(schedule.cron_expression)) {
        console.error(`❌ Geçersiz cron ifadesi: ${schedule.cron_expression}`);
        return;
    }

    const job = cron.schedule(schedule.cron_expression, async () => {
        try {
            // Günlük limit kontrolü
            const todayCount = db.getTodayPostCount();
            if (todayCount >= config.maxDailyPosts) {
                console.log(`⚠️ Günlük limit (${config.maxDailyPosts}) aşıldı, atlanıyor.`);
                return;
            }

            console.log(`🔄 Otomatik içerik üretiliyor: ${schedule.niche_name}`);

            // İçerik üret
            const result = await generateTweet(schedule.niche_name);
            const fullContent = result.hashtags
                ? `${result.content}\n\n${result.hashtags}`
                : result.content;

            // Veritabanına kaydet
            const niche = db.getNicheByName(schedule.niche_name);
            if (niche) {
                db.savePost(niche.id, fullContent, 'tweet', 'draft');
            }

            // Twitter bağlıysa paylaş
            if (isTwitterConfigured()) {
                const tweetResult = await postTweet(fullContent);

                if (tweetResult.success) {
                    const draft = db.getLastDraftPost();
                    if (draft) {
                        db.markPostAsPublished(draft.id, tweetResult.tweetId);
                    }

                    // Telegram'a bildir
                    if (notifyFn) {
                        await notifyFn(
                            `✅ *Otomatik Tweet Paylaşıldı!*\n\n` +
                            `📌 Niş: ${schedule.niche_name}\n` +
                            `📝 ${fullContent}\n\n` +
                            `🔗 https://twitter.com/i/status/${tweetResult.tweetId}`
                        );
                    }
                } else {
                    if (notifyFn) {
                        await notifyFn(`❌ Otomatik tweet paylaşılamadı: ${tweetResult.error}`);
                    }
                }
            } else {
                // Twitter yoksa sadece üret ve bildir
                if (notifyFn) {
                    await notifyFn(
                        `📝 *Otomatik İçerik Üretildi* (Twitter bağlı değil)\n\n` +
                        `📌 Niş: ${schedule.niche_name}\n` +
                        `${fullContent}`
                    );
                }
            }

            db.updateScheduleLastRun(schedule.id);
        } catch (error) {
            console.error('Zamanlanmış görev hatası:', error.message);
            if (notifyFn) {
                await notifyFn(`❌ Zamanlanmış görev hatası: ${error.message}`);
            }
        }
    });

    activeJobs.set(schedule.id, job);
    console.log(`  📅 Görev #${schedule.id}: ${schedule.niche_name} → ${schedule.cron_expression}`);
}

/**
 * Yeni zamanlama ekle ve hemen başlat
 */
function addAndStartSchedule(nicheId, cronExpression, notifyFn) {
    const result = db.addSchedule(nicheId, cronExpression);
    const schedules = db.getActiveSchedules();
    const newSchedule = schedules.find((s) => s.id === result.lastInsertRowid);

    if (newSchedule) {
        scheduleJob(newSchedule, notifyFn);
    }

    return result;
}

/**
 * Tüm görevleri durdur
 */
function stopAll() {
    activeJobs.forEach((job) => job.stop());
    activeJobs.clear();
}

/**
 * Aktif görev sayısı
 */
function getActiveJobCount() {
    return activeJobs.size;
}

module.exports = { startScheduler, addAndStartSchedule, stopAll, getActiveJobCount };
