const TelegramBot = require('node-telegram-bot-api');
const { config, isTwitterConfigured, getActiveProvider } = require('../config');
const { generateTweet, generateThread } = require('../llm/generator');
const { postTweet, postThread, getMe } = require('../twitter/client');
const { analyzeProfile, formatAnalysisForTelegram } = require('../twitter/analyzer');
const { addAndStartSchedule, getActiveJobCount, stopAll } = require('../scheduler/cron');
const { evaluateTweetQuality, summarizeRedFlags } = require('../quality/content-quality');
const db = require('../db/database');
const { t } = require('../utils/i18n');
const { RateLimiter, escapeMarkdown, stripMarkdownFormatting, sanitizeInput } = require('../utils/helpers');
const logger = require('../utils/logger');
const metrics = require('../observability/metrics');

let bot;
let pendingPost = null;
const rateLimiter = new RateLimiter(3000); // 3 saniye cooldown

function md(value) {
    return escapeMarkdown(String(value ?? ''));
}

function isMarkdownParseError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('parse entities') || message.includes("can't parse");
}

function formatQualityMetadata(quality, promptVersion) {
    const lines = [];

    if (promptVersion) {
        lines.push(t('generate.template_label', { version: md(promptVersion) }));
    }

    if (quality) {
        lines.push(t('generate.quality_label', { score: quality.score, grade: md(quality.grade) }));
        if (quality.action && quality.action !== 'allow') {
            lines.push(t('generate.quality_action', { action: md(quality.action) }));
        }
        if (Array.isArray(quality.redFlags) && quality.redFlags.length > 0) {
            lines.push(t('generate.red_flags', { flags: md(summarizeRedFlags(quality.redFlags)) }));
        }
    }

    if (lines.length === 0) return '';
    return `${lines.join('\n')}\n`;
}

function sendMessageSafe(chatId, text, options = {}) {
    if (!bot) return Promise.resolve(null);

    const sendOptions = { ...options };
    const parseMode = sendOptions.parseMode || sendOptions.parse_mode || null;
    delete sendOptions.parseMode;
    if (parseMode) sendOptions.parse_mode = parseMode;

    metrics.incCounter(
        'nichebot_telegram_send_attempts_total',
        'Total outbound Telegram send attempts',
        { parseMode: parseMode || 'none' }
    );

    return bot.sendMessage(chatId, text, sendOptions).then((response) => {
        metrics.incCounter(
            'nichebot_telegram_send_success_total',
            'Total successful outbound Telegram sends',
            { parseMode: parseMode || 'none' }
        );
        return response;
    }).catch(async (error) => {
        metrics.incCounter(
            'nichebot_telegram_send_failures_total',
            'Total failed outbound Telegram sends',
            { stage: 'primary', parseMode: parseMode || 'none' }
        );
        if (parseMode === 'Markdown' && isMarkdownParseError(error)) {
            logger.warn('Telegram Markdown parse failed, retrying as plain text.', {
                chatId,
                error: error.message,
            });
            const fallback = stripMarkdownFormatting(text);
            const plainOptions = { ...sendOptions };
            delete plainOptions.parse_mode;

            try {
                const fallbackResponse = await bot.sendMessage(chatId, fallback, plainOptions);
                metrics.incCounter(
                    'nichebot_telegram_send_success_total',
                    'Total successful outbound Telegram sends',
                    { parseMode: 'fallback_plain' }
                );
                return fallbackResponse;
            } catch (fallbackError) {
                metrics.incCounter(
                    'nichebot_telegram_send_failures_total',
                    'Total failed outbound Telegram sends',
                    { stage: 'fallback_plain', parseMode: 'none' }
                );
                logger.error('Telegram plain-text fallback failed.', {
                    chatId,
                    error: fallbackError.message,
                });
                return null;
            }
        }

        logger.error('Telegram sendMessage failed.', { chatId, error: error.message });
        return null;
    });
}

/**
 * Telegram botunu başlat
 */
function initBot() {
    bot = new TelegramBot(config.telegram.token, { polling: true });
    registerCommands();
    logger.info('Telegram botu başlatıldı');
    return bot;
}

/**
 * Bot'u durdur
 */
function stopBot() {
    if (bot) {
        bot.stopPolling();
        logger.info('Telegram polling durduruldu');
    }
}

/**
 * Yetki + rate limit kontrolü
 * @returns {boolean} Devam edilebilir mi
 */
function checkAccess(msg, command = 'general') {
    const chatId = msg.chat.id;
    metrics.incCounter(
        'nichebot_commands_received_total',
        'Total received bot commands',
        { command }
    );

    // Yetki kontrolü
    if (config.telegram.allowedUserId && msg.from.id !== config.telegram.allowedUserId) {
        metrics.incCounter(
            'nichebot_commands_denied_total',
            'Total denied bot commands',
            { command, reason: 'unauthorized' }
        );
        sendMessageSafe(chatId, t('bot.unauthorized'));
        return false;
    }

    // Rate limit
    const key = `${msg.from.id}:${command}`;
    if (!rateLimiter.canProceed(key)) {
        const remaining = Math.ceil(rateLimiter.getRemainingMs(key) / 1000);
        metrics.incCounter(
            'nichebot_commands_denied_total',
            'Total denied bot commands',
            { command, reason: 'rate_limited' }
        );
        sendMessageSafe(chatId, t('bot.rate_limited', { seconds: remaining }));
        return false;
    }

    metrics.incCounter(
        'nichebot_commands_allowed_total',
        'Total accepted bot commands',
        { command }
    );

    // chatId'yi kaydet (scheduler bildirimleri için)
    db.setSetting('telegram_chat_id', String(chatId));

    return true;
}

/**
 * Tüm komutları kaydet
 */
function registerCommands() {
    // /start
    bot.onText(/\/start/, async (msg) => {
        if (!checkAccess(msg, 'start')) return;
        const chatId = msg.chat.id;
        const provider = getActiveProvider();
        const twitterUser = await getMe();

        let text = t('bot.welcome') + '\n\n';
        text += t('bot.connection_status') + '\n';
        text += `${t('bot.llm_label')} ✅ ${md(provider.name)} (${md(provider.model)})\n`;
        text += twitterUser
            ? `${t('bot.twitter_label')} ${t('bot.twitter_connected', { username: md(twitterUser.username) })}\n`
            : `${t('bot.twitter_label')} ${t('bot.twitter_not_connected')}\n`;
        text += t('bot.active_jobs', { count: getActiveJobCount() }) + '\n';
        text += t('bot.commands_header') + '\n';
        text += `/niche <topic> — Add niche\n`;
        text += `/nisler — List niches\n`;
        text += `/sil <topic> — Remove niche\n`;
        text += `/uret — Generate tweet\n`;
        text += `/thread <count> — Generate thread\n`;
        text += `/onayla — Publish\n`;
        text += `/reddet — Regenerate\n`;
        text += `/analiz <user> — Profile analysis\n`;
        text += `/zamanlama — Auto-post settings\n`;
        text += `/durum — Statistics\n`;
        text += `/dil <tr|en> — Change language`;

        sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });
    });

    // /dil — Dil değiştir
    bot.onText(/\/dil(?:\s+(tr|en))?/, (msg, match) => {
        if (!checkAccess(msg, 'dil')) return;
        const chatId = msg.chat.id;
        const lang = match?.[1];

        if (!lang) {
            sendMessageSafe(chatId, '🌍 `/dil tr` — Türkçe\n🌍 `/dil en` — English', { parse_mode: 'Markdown' });
            return;
        }

        const { setLanguage } = require('../utils/i18n');
        setLanguage(lang);
        db.setSetting('language', lang);

        sendMessageSafe(chatId, lang === 'tr' ? '✅ Dil Türkçe olarak ayarlandı.' : '✅ Language set to English.');
    });

    // /niche <konu>
    bot.onText(/\/niche (.+)/, (msg, match) => {
        if (!checkAccess(msg, 'niche')) return;
        const chatId = msg.chat.id;
        const raw = match[1].trim();
        const nicheName = sanitizeInput(raw, 50);

        if (!nicheName || !/^[\w\sçğıöşüÇĞİÖŞÜa-zA-Z0-9]+$/.test(nicheName)) {
            sendMessageSafe(chatId, t('niche.invalid_name'));
            return;
        }

        const niche = db.addNiche(nicheName);
        if (niche) {
            sendMessageSafe(chatId, t('niche.added', { name: md(niche.name) }), { parse_mode: 'Markdown' });
        } else {
            sendMessageSafe(chatId, t('niche.exists', { name: md(nicheName) }), { parse_mode: 'Markdown' });
        }
    });

    // /nisler
    bot.onText(/\/nisler/, (msg) => {
        if (!checkAccess(msg, 'nisler')) return;
        const chatId = msg.chat.id;
        const niches = db.getAllNiches();

        if (niches.length === 0) {
            sendMessageSafe(chatId, t('niche.empty'), { parse_mode: 'Markdown' });
            return;
        }

        let text = t('niche.list_header', { count: niches.length }) + '\n';
        niches.forEach((n, i) => {
            text += `${i + 1}. *${md(n.name)}* — ${md(n.tone)}\n`;
        });

        sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });
    });

    // /sil <konu>
    bot.onText(/\/sil (.+)/, (msg, match) => {
        if (!checkAccess(msg, 'sil')) return;
        const chatId = msg.chat.id;
        const nicheName = sanitizeInput(match[1], 50);

        if (db.removeNiche(nicheName)) {
            sendMessageSafe(chatId, t('niche.removed', { name: md(nicheName) }), { parse_mode: 'Markdown' });
        } else {
            sendMessageSafe(chatId, t('niche.not_found', { name: md(nicheName) }), { parse_mode: 'Markdown' });
        }
    });

    // /uret
    bot.onText(/\/uret(?:\s+(.+))?/, async (msg, match) => {
        if (!checkAccess(msg, 'uret')) return;
        const chatId = msg.chat.id;

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            sendMessageSafe(chatId, t('niche.add_first'), { parse_mode: 'Markdown' });
            return;
        }

        const nicheName = match?.[1]?.trim() || niches[0].name;
        const niche = db.getNicheByName(nicheName);

        if (!niche) {
            sendMessageSafe(chatId, t('niche.not_found', { name: md(nicheName) }), { parse_mode: 'Markdown' });
            return;
        }

        sendMessageSafe(chatId, t('generate.generating', { niche: md(niche.name) }), { parse_mode: 'Markdown' });

        try {
            const profileAnalysis = db.getLatestProfileAnalysis(db.getSetting('twitter_username', ''));
            const profileContext = profileAnalysis ? profileAnalysis.analysis : '';

            const result = await generateTweet(niche.name, {
                tone: niche.tone,
                language: config.defaultLanguage,
                profileContext,
                templateVersion: config.prompt.templateVersion,
            });

            const fullContent = result.hashtags ? `${result.content}\n\n${result.hashtags}` : result.content;
            const saved = db.savePost(niche.id, fullContent, 'tweet', 'draft', {
                promptVersion: result?.prompt?.version || null,
                qualityScore: result?.quality?.score ?? null,
                qualityFlags: result?.quality?.redFlags || [],
            });

            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                nicheName: niche.name,
                quality: result.quality,
                promptVersion: result?.prompt?.version || null,
            };

            let preview = t('generate.preview_header') + md(fullContent) + '\n\n';
            preview += `${t('generate.niche_label', { niche: md(niche.name) })}\n`;
            preview += `${t('generate.char_count', { count: fullContent.length })}\n\n`;
            preview += formatQualityMetadata(result.quality, result?.prompt?.version);
            preview += `${t('generate.approve')}\n${t('generate.reject')}\n${t('generate.edit_hint')}`;

            sendMessageSafe(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Tweet üretme hatası', { error: error.message });
            sendMessageSafe(chatId, t('generate.error', { error: md(error.message) }), { parse_mode: 'Markdown' });
        }
    });

    // /thread
    bot.onText(/\/thread(?:\s+(\d+))?/, async (msg, match) => {
        if (!checkAccess(msg, 'thread')) return;
        const chatId = msg.chat.id;
        const count = Math.min(parseInt(match?.[1]) || 4, 10); // Max 10

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            sendMessageSafe(chatId, t('niche.add_first'), { parse_mode: 'Markdown' });
            return;
        }

        const niche = niches[0];
        sendMessageSafe(chatId, t('thread.generating', { count, niche: md(niche.name) }), { parse_mode: 'Markdown' });

        try {
            const result = await generateThread(niche.name, count, {
                tone: niche.tone,
                language: config.defaultLanguage,
                templateVersion: config.prompt.templateVersion,
            });

            let preview = t('thread.preview_header', { count: result.tweets.length }) + '\n';
            result.tweets.forEach((tw, i) => {
                preview += `*${i + 1}/${result.tweets.length}* ${md(tw)}\n\n`;
            });
            if (result.hashtags) preview += `${md(result.hashtags)}\n\n`;
            preview += formatQualityMetadata(result.quality, result?.prompt?.version);
            preview += `${t('generate.approve')}\n${t('generate.reject')}`;

            const fullContent = result.tweets.join('\n---\n');
            const saved = db.savePost(niche.id, fullContent, 'thread', 'draft', {
                promptVersion: result?.prompt?.version || null,
                qualityScore: result?.quality?.score ?? null,
                qualityFlags: result?.quality?.redFlags || [],
            });

            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                tweets: result.tweets,
                hashtags: result.hashtags,
                nicheName: niche.name,
                type: 'thread',
                quality: result.quality,
                promptVersion: result?.prompt?.version || null,
            };

            sendMessageSafe(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Thread üretme hatası', { error: error.message });
            sendMessageSafe(chatId, t('thread.error', { error: md(error.message) }), { parse_mode: 'Markdown' });
        }
    });

    // /onayla
    bot.onText(/\/onayla/, async (msg) => {
        if (!checkAccess(msg, 'onayla')) return;
        const chatId = msg.chat.id;

        if (!pendingPost) {
            sendMessageSafe(chatId, t('generate.no_pending'), { parse_mode: 'Markdown' });
            return;
        }

        if (!isTwitterConfigured()) {
            sendMessageSafe(chatId, t('publish.no_twitter'));
            pendingPost = null;
            return;
        }

        sendMessageSafe(chatId, t('publish.publishing'));

        try {
            let result;

            if (pendingPost.type === 'thread' && pendingPost.tweets) {
                const tweetsWithHashtags = [...pendingPost.tweets];
                if (pendingPost.hashtags) {
                    tweetsWithHashtags[tweetsWithHashtags.length - 1] += `\n\n${pendingPost.hashtags}`;
                }
                result = await postThread(tweetsWithHashtags);
            } else {
                result = await postTweet(pendingPost.content);
            }

            if (result.success) {
                const tweetId = result.tweetId || result.tweetIds?.[0];
                db.markPostAsPublished(pendingPost.id, tweetId);
                sendMessageSafe(chatId, t('publish.success', { tweetId: md(tweetId) }), { parse_mode: 'Markdown' });
            } else {
                sendMessageSafe(chatId, t('publish.error', { error: md(result.error) }), { parse_mode: 'Markdown' });
            }
        } catch (error) {
            sendMessageSafe(chatId, t('publish.error', { error: md(error.message) }), { parse_mode: 'Markdown' });
        }

        pendingPost = null;
    });

    // /reddet
    bot.onText(/\/reddet/, async (msg) => {
        if (!checkAccess(msg, 'reddet')) return;
        const chatId = msg.chat.id;

        if (!pendingPost) {
            sendMessageSafe(chatId, t('generate.no_pending'), { parse_mode: 'Markdown' });
            return;
        }

        const nicheName = pendingPost.nicheName;
        pendingPost = null;

        sendMessageSafe(chatId, t('generate.generating', { niche: md(nicheName) }), { parse_mode: 'Markdown' });

        try {
            const result = await generateTweet(nicheName, {
                language: config.defaultLanguage,
                templateVersion: config.prompt.templateVersion,
            });
            const fullContent = result.hashtags ? `${result.content}\n\n${result.hashtags}` : result.content;

            const niche = db.getNicheByName(nicheName);
            const saved = db.savePost(niche.id, fullContent, 'tweet', 'draft', {
                promptVersion: result?.prompt?.version || null,
                qualityScore: result?.quality?.score ?? null,
                qualityFlags: result?.quality?.redFlags || [],
            });

            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                nicheName,
                quality: result.quality,
                promptVersion: result?.prompt?.version || null,
            };

            let preview = t('generate.new_preview') + md(fullContent) + '\n\n';
            preview += formatQualityMetadata(result.quality, result?.prompt?.version);
            preview += `${t('generate.approve')} | ${t('generate.reject')}`;

            sendMessageSafe(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            sendMessageSafe(chatId, t('generate.error', { error: md(error.message) }), { parse_mode: 'Markdown' });
        }
    });

    // /analiz
    bot.onText(/\/analiz(?:\s+@?(.+))?/, async (msg, match) => {
        if (!checkAccess(msg, 'analiz')) return;
        const chatId = msg.chat.id;
        const username = sanitizeInput(match?.[1]?.replace('@', ''), 30);

        if (!username) {
            sendMessageSafe(chatId, t('analyze.usage'), { parse_mode: 'Markdown' });
            return;
        }

        if (!isTwitterConfigured()) {
            sendMessageSafe(chatId, t('bot.api_not_ready', { service: 'Twitter' }));
            return;
        }

        sendMessageSafe(chatId, t('analyze.analyzing', { username: md(username) }), { parse_mode: 'Markdown' });

        try {
            const analysis = await analyzeProfile(username);
            const text = formatAnalysisForTelegram(analysis);
            db.setSetting('twitter_username', username);
            sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Analiz hatası', { username, error: error.message });
            sendMessageSafe(chatId, t('analyze.error', { error: md(error.message) }), { parse_mode: 'Markdown' });
        }
    });

    // /zamanlama
    bot.onText(/\/zamanlama(?:\s+(.+))?/, (msg, match) => {
        if (!checkAccess(msg, 'zamanlama')) return;
        const chatId = msg.chat.id;
        const param = match?.[1]?.trim();

        if (!param) {
            let text = t('schedule.header') + '\n\n';
            text += t('schedule.examples') + '\n\n';
            text += t('schedule.active_count', { count: getActiveJobCount() });
            sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });
            return;
        }

        if (param === 'kapat' || param === 'stop') {
            stopAll();
            sendMessageSafe(chatId, t('schedule.stopped'));
            return;
        }

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            sendMessageSafe(chatId, t('niche.add_first'), { parse_mode: 'Markdown' });
            return;
        }

        const times = param.split(',').map((t) => t.trim());

        for (const time of times) {
            const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (!timeMatch) {
                sendMessageSafe(chatId, t('schedule.invalid_time', { time: md(time) }), { parse_mode: 'Markdown' });
                return;
            }
        }

        let addedCount = 0;
        // Bildirim fonksiyonu — scheduler'dan Telegram'a bildirim
        const notifyFn = (text) => sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });

        for (const time of times) {
            const [, hour, minute] = time.match(/^(\d{1,2}):(\d{2})$/);
            const cronExpr = `${minute} ${hour} * * *`;
            addAndStartSchedule(niches[0].id, cronExpr, notifyFn);
            addedCount++;
        }

        sendMessageSafe(
            chatId,
            t('schedule.added', { count: addedCount, niche: md(niches[0].name), times: md(times.join(', ')) }),
            { parse_mode: 'Markdown' }
        );
    });

    // /durum
    bot.onText(/\/durum/, async (msg) => {
        if (!checkAccess(msg, 'durum')) return;
        const chatId = msg.chat.id;

        const stats = db.getPostStats();
        const niches = db.getAllNiches();
        const provider = getActiveProvider();
        const twitterUser = await getMe();

        let text = t('stats.header') + '\n';
        text += `🧠 *LLM:* ${provider.name} (${provider.model})\n`;
        text += twitterUser
            ? `🐦 *Twitter:* @${md(twitterUser.username)}\n`
            : `🐦 *Twitter:* ${t('bot.twitter_not_connected')}\n`;
        text += `📅 *Active Jobs:* ${getActiveJobCount()}\n\n`;
        text += t('stats.content_header') + '\n';
        text += t('stats.total', { count: stats.total || 0 }) + '\n';
        text += t('stats.published', { count: stats.published || 0 }) + '\n';
        text += t('stats.drafts', { count: stats.drafts || 0 }) + '\n';
        text += t('stats.today', { count: stats.today || 0, max: config.maxDailyPosts }) + '\n\n';
        text += t('stats.avg_quality', { score: stats.avg_quality ?? '-' }) + '\n';
        text += t('stats.niches_label', { count: niches.length, list: md(niches.map((n) => n.name).join(', ') || '-') });

        sendMessageSafe(chatId, text, { parse_mode: 'Markdown' });
    });

    // Düz metin — düzenleme
    bot.on('message', (msg) => {
        if (config.telegram.allowedUserId && msg.from.id !== config.telegram.allowedUserId) return;
        if (msg.text?.startsWith('/')) return;

        if (pendingPost && msg.text) {
            pendingPost.content = msg.text;
            pendingPost.quality = evaluateTweetQuality({ content: msg.text });
            const niche = db.getNicheByName(pendingPost.nicheName);
            if (niche) {
                db.savePost(niche.id, msg.text, 'tweet', 'draft', {
                    promptVersion: pendingPost.promptVersion || null,
                    qualityScore: pendingPost.quality?.score ?? null,
                    qualityFlags: pendingPost.quality?.redFlags || [],
                });
            }

            sendMessageSafe(
                msg.chat.id,
                `${t('generate.updated')}\n\n${md(msg.text)}\n\n${formatQualityMetadata(pendingPost.quality, pendingPost.promptVersion)}${t('generate.approve')} | ${t('generate.reject')}`,
                { parse_mode: 'Markdown' }
            );
        }
    });
}

/**
 * Scheduler için bildirim fonksiyonu üret
 */
function getSchedulerNotifyFn() {
    const chatId = db.getSetting('telegram_chat_id');
    if (!chatId || !bot) return null;
    return (text) => sendMessageSafe(Number.parseInt(chatId, 10), text, { parse_mode: 'Markdown' });
}

module.exports = { initBot, stopBot, getSchedulerNotifyFn };
