const cron = require('node-cron');
const { generateTweet } = require('../llm/generator');
const { postTweet } = require('../twitter/client');
const db = require('../db/database');
const { config, isTwitterConfigured } = require('../config');
const { t } = require('../utils/i18n');
const logger = require('../utils/logger');
const metrics = require('../observability/metrics');
const { summarizeRedFlags } = require('../quality/content-quality');

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

    metrics.setGauge(
        'nichebot_scheduler_active_jobs',
        'Number of currently active scheduler jobs',
        {},
        activeJobs.size
    );
    metrics.setGauge(
        'nichebot_scheduler_configured_jobs',
        'Number of configured scheduler rows',
        {},
        schedules.length
    );
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
        metrics.incCounter(
            'nichebot_scheduler_invalid_cron_total',
            'Invalid scheduler cron expressions',
            {}
        );
        logger.error(`Geçersiz cron ifadesi: ${schedule.cron_expression}`);
        return;
    }

    const job = cron.schedule(schedule.cron_expression, async () => {
        try {
            metrics.incCounter('nichebot_scheduler_runs_total', 'Total scheduler executions', {
                niche: String(schedule.niche_name || 'unknown'),
            });
            // Günlük limit kontrolü
            const todayCount = db.getTodayPostCount();
            if (todayCount >= config.maxDailyPosts) {
                metrics.incCounter('nichebot_scheduler_skipped_total', 'Total skipped scheduler runs', {
                    reason: 'daily_limit',
                });
                logger.info(t('scheduler.daily_limit', { max: config.maxDailyPosts }));
                return;
            }

            logger.info(`Otomatik içerik üretiliyor: ${schedule.niche_name}`);

            // İçerik üret
            const result = await generateTweet(schedule.niche_name, {
                language: config.defaultLanguage,
                templateVersion: config.prompt.templateVersion,
            });
            const fullContent = result.hashtags
                ? `${result.content}\n\n${result.hashtags}`
                : result.content;
            const qualityScore = Number(result?.quality?.score);
            const minAutoPublishScore = Number(config.quality?.minAutoPublishScore ?? 65);

            // Veritabanına kaydet
            const niche = db.getNicheByName(schedule.niche_name);
            let draftInsertResult = null;
            if (niche) {
                draftInsertResult = db.savePost(niche.id, fullContent, 'tweet', 'draft', {
                    promptVersion: result?.prompt?.version || null,
                    qualityScore: Number.isFinite(qualityScore) ? qualityScore : null,
                    qualityFlags: result?.quality?.redFlags || [],
                });
            }

            if (Number.isFinite(qualityScore) && qualityScore < minAutoPublishScore) {
                metrics.incCounter('nichebot_scheduler_skipped_total', 'Total skipped scheduler runs', {
                    reason: 'quality_threshold',
                });
                logger.warn('Otomatik paylaşım kalite eşiği nedeniyle atlandı', {
                    niche: schedule.niche_name,
                    score: qualityScore,
                    minAutoPublishScore,
                    redFlags: summarizeRedFlags(result?.quality?.redFlags || []),
                });
                if (notifyFn) {
                    await notifyFn(t('scheduler.low_quality', {
                        niche: schedule.niche_name,
                        score: qualityScore,
                        min: minAutoPublishScore,
                        flags: summarizeRedFlags(result?.quality?.redFlags || []),
                    }));
                }
                db.updateScheduleLastRun(schedule.id);
                return;
            }

            // Twitter bağlıysa paylaş
            if (isTwitterConfigured()) {
                const tweetResult = await postTweet(fullContent);

                if (tweetResult.success) {
                    if (draftInsertResult?.lastInsertRowid) {
                        db.markPostAsPublished(draftInsertResult.lastInsertRowid, tweetResult.tweetId);
                    } else {
                        const draft = db.getLastDraftPost();
                        if (draft) db.markPostAsPublished(draft.id, tweetResult.tweetId);
                    }

                    metrics.incCounter('nichebot_scheduler_publish_success_total', 'Successful scheduler publishes', {});
                    if (notifyFn) {
                        await notifyFn(t('scheduler.auto_posted', {
                            niche: schedule.niche_name,
                            content: fullContent,
                            tweetId: tweetResult.tweetId,
                        }));
                    }
                } else {
                    metrics.incCounter('nichebot_scheduler_publish_failures_total', 'Failed scheduler publishes', {});
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
            metrics.incCounter('nichebot_scheduler_failures_total', 'Scheduler execution failures', {});
            logger.error('Zamanlanmış görev hatası', { error: error.message });
            if (notifyFn) {
                await notifyFn(t('scheduler.auto_failed', { error: error.message }));
            }
        }
    });

    activeJobs.set(schedule.id, job);
    metrics.setGauge(
        'nichebot_scheduler_active_jobs',
        'Number of currently active scheduler jobs',
        {},
        activeJobs.size
    );
    logger.info(`Görev #${schedule.id}: ${schedule.niche_name} → ${schedule.cron_expression}`);
}

/**
 * Yeni zamanlama ekle ve hemen başlat
 */
function addAndStartSchedule(nicheId, cronExpression, notifyFn) {
    const result = db.addSchedule(nicheId, cronExpression);
    metrics.incCounter('nichebot_scheduler_created_total', 'Scheduler jobs created', {});
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
    metrics.setGauge(
        'nichebot_scheduler_active_jobs',
        'Number of currently active scheduler jobs',
        {},
        0
    );
    logger.info('Tüm zamanlanmış görevler durduruldu');
}

/**
 * Aktif görev sayısı
 */
function getActiveJobCount() {
    return activeJobs.size;
}

module.exports = { startScheduler, addAndStartSchedule, stopAll, getActiveJobCount };
