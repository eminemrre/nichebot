const cron = require('node-cron');
const { generateTweet } = require('../llm/generator');
const { postTweet } = require('../twitter/client');
const db = require('../db/database');
const { config, isTwitterConfigured } = require('../config');
const { t } = require('../utils/i18n');
const logger = require('../utils/logger');

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

    logger.info(`${schedules.length} zamanlanmış görev başlatıldı`);
}

/**
 * Tek bir görev planla
 */
function scheduleJob(schedule, notifyFn) {
    if (activeJobs.has(schedule.id)) {
        activeJobs.get(schedule.id).stop();
    }

    if (!cron.validate(schedule.cron_expression)) {
        logger.error(`Geçersiz cron ifadesi: ${schedule.cron_expression}`);
        return;
    }

    const job = cron.schedule(schedule.cron_expression, async () => {
        try {
            // Günlük limit kontrolü
            const todayCount = db.getTodayPostCount();
            if (todayCount >= config.maxDailyPosts) {
                logger.info(t('scheduler.daily_limit', { max: config.maxDailyPosts }));
                return;
            }

            logger.info(`Otomatik içerik üretiliyor: ${schedule.niche_name}`);

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

                    if (notifyFn) {
                        await notifyFn(t('scheduler.auto_posted', {
                            niche: schedule.niche_name,
                            content: fullContent,
                            tweetId: tweetResult.tweetId,
                        }));
                    }
                } else {
                    if (notifyFn) {
                        await notifyFn(t('scheduler.auto_failed', { error: tweetResult.error }));
                    }
                }
            } else {
                if (notifyFn) {
                    await notifyFn(t('scheduler.auto_generated', {
                        niche: schedule.niche_name,
                        content: fullContent,
                    }));
                }
            }

            db.updateScheduleLastRun(schedule.id);
        } catch (error) {
            logger.error('Zamanlanmış görev hatası', { error: error.message });
            if (notifyFn) {
                await notifyFn(t('scheduler.auto_failed', { error: error.message }));
            }
        }
    });

    activeJobs.set(schedule.id, job);
    logger.info(`Görev #${schedule.id}: ${schedule.niche_name} → ${schedule.cron_expression}`);
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
    logger.info('Tüm zamanlanmış görevler durduruldu');
}

/**
 * Aktif görev sayısı
 */
function getActiveJobCount() {
    return activeJobs.size;
}

module.exports = { startScheduler, addAndStartSchedule, stopAll, getActiveJobCount };
