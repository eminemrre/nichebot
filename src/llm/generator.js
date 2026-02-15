const { chat } = require('./provider');
const db = require('../db/database');
const logger = require('../utils/logger');
const metrics = require('../observability/metrics');
const { getPromptTemplate, DEFAULT_PROMPT_TEMPLATE_VERSION } = require('./templates');
const {
    evaluateTweetQuality,
    evaluateThreadQuality,
    summarizeRedFlags,
} = require('../quality/content-quality');

const QUALITY_RETRY_APPENDIX = `
EK KALİTE/GÜVENLİK KURALI:
- Red-flag oluşturan riskli kalıpları kullanma.
- Kesin sonuç/garanti vaadinden kaçın.
- Spam veya manipülatif çağrı yazma.
- Zararlı veya yasa dışı yönlendirme yazma.
`;

function emitQualityMetrics(type, quality) {
    metrics.incCounter('nichebot_quality_checks_total', 'Total content quality checks', {
        type,
        action: quality.action,
        grade: quality.grade,
    });
    metrics.setGauge(
        'nichebot_quality_last_score',
        'Latest content quality score',
        { type },
        quality.score
    );

    if (quality.action === 'warn') {
        metrics.incCounter('nichebot_quality_warnings_total', 'Quality checks with warning outcome', { type });
    }
    if (quality.action === 'block') {
        metrics.incCounter('nichebot_quality_blocks_total', 'Quality checks blocked by guardrails', { type });
    }

    quality.redFlags.forEach((flag) => {
        metrics.incCounter('nichebot_quality_red_flags_total', 'Detected content red flags', {
            type,
            code: flag.code,
            severity: flag.severity,
        });
    });
}

function buildPromptMetadata(templateInfo) {
    return {
        type: templateInfo.type,
        version: templateInfo.resolvedVersion,
        requestedVersion: templateInfo.requestedVersion,
        fallbackUsed: templateInfo.fallbackUsed,
    };
}

/**
 * Niş konuya göre tweet içeriği üret
 * @param {string} nicheName - Niş adı (örn: "yapay zeka")
 * @param {object} options - Ek seçenekler
 * @returns {Promise<{ content: string, hashtags: string, quality: object, prompt: object }>}
 */
async function generateTweet(nicheName, options = {}) {
    const {
        tone = 'bilgilendirici',
        language = 'tr',
        profileContext = '',
        templateVersion = DEFAULT_PROMPT_TEMPLATE_VERSION,
    } = options;

    const niche = db.getNicheByName(nicheName);
    const recentPosts = niche ? db.getRecentPostsByNiche(niche.id, 10) : [];
    const recentTexts = recentPosts.map((p) => `- ${p.content}`).join('\n');
    const recentContents = recentPosts.map((p) => String(p.content || ''));

    const templateInfo = getPromptTemplate('tweet', templateVersion);
    if (templateInfo.fallbackUsed) {
        logger.warn('İstenen tweet prompt şablonu bulunamadı, fallback kullanıldı.', {
            requestedVersion: templateInfo.requestedVersion,
            resolvedVersion: templateInfo.resolvedVersion,
            supportedVersions: templateInfo.supportedVersions,
        });
    }

    const promptContext = {
        nicheName,
        tone,
        language,
        profileContext,
        recentTexts,
    };

    const systemPrompt = templateInfo.buildSystemPrompt(promptContext);
    const userMessage = templateInfo.buildUserPrompt(promptContext);

    logger.debug('Tweet üretiliyor', {
        niche: nicheName,
        tone,
        language,
        promptVersion: templateInfo.resolvedVersion,
    });

    let response = await chat(systemPrompt, userMessage);
    let parsed = parseTweetResponse(response);
    let quality = evaluateTweetQuality({
        content: parsed.content,
        hashtags: parsed.hashtags,
        recentContents,
    });
    emitQualityMetrics('tweet', quality);

    if (quality.action === 'block') {
        metrics.incCounter(
            'nichebot_quality_regenerations_total',
            'Total regenerations triggered by quality guardrails',
            { type: 'tweet', reason: 'red_flag' }
        );
        logger.warn('Tweet kalite kontrolünde bloklandı, güvenli tekrar deneniyor.', {
            niche: nicheName,
            redFlags: summarizeRedFlags(quality.redFlags),
        });

        response = await chat(
            `${systemPrompt}\n${QUALITY_RETRY_APPENDIX}`,
            `${userMessage}\n\nRiskli/red-flag oluşturabilecek ifadeleri kullanmadan tekrar üret.`
        );
        parsed = parseTweetResponse(response);
        quality = evaluateTweetQuality({
            content: parsed.content,
            hashtags: parsed.hashtags,
            recentContents,
        });
        emitQualityMetrics('tweet', quality);
    }

    if (quality.action === 'block') {
        throw new Error(`İçerik kalite kontrolünü geçemedi: ${summarizeRedFlags(quality.redFlags)}`);
    }

    return {
        content: parsed.content,
        hashtags: parsed.hashtags,
        quality,
        prompt: buildPromptMetadata(templateInfo),
    };
}

/**
 * Thread (konu dizisi) üret
 * @param {string} nicheName - Niş adı
 * @param {number} tweetCount - Thread'deki tweet sayısı
 * @returns {Promise<{ tweets: string[], hashtags: string, quality: object, prompt: object }>}
 */
async function generateThread(nicheName, tweetCount = 4, options = {}) {
    const {
        tone = 'bilgilendirici',
        language = 'tr',
        templateVersion = DEFAULT_PROMPT_TEMPLATE_VERSION,
    } = options;

    const niche = db.getNicheByName(nicheName);
    const recentPosts = niche ? db.getRecentPostsByNiche(niche.id, 10) : [];
    const recentContents = recentPosts.map((p) => String(p.content || ''));

    const templateInfo = getPromptTemplate('thread', templateVersion);
    if (templateInfo.fallbackUsed) {
        logger.warn('İstenen thread prompt şablonu bulunamadı, fallback kullanıldı.', {
            requestedVersion: templateInfo.requestedVersion,
            resolvedVersion: templateInfo.resolvedVersion,
            supportedVersions: templateInfo.supportedVersions,
        });
    }

    const promptContext = {
        nicheName,
        tweetCount,
        tone,
        language,
    };

    const systemPrompt = templateInfo.buildSystemPrompt(promptContext);
    const userMessage = templateInfo.buildUserPrompt(promptContext);

    logger.debug('Thread üretiliyor', {
        niche: nicheName,
        count: tweetCount,
        promptVersion: templateInfo.resolvedVersion,
    });

    let response = await chat(systemPrompt, userMessage);
    let parsed = parseThreadResponse(response);
    let quality = evaluateThreadQuality({
        tweets: parsed.tweets,
        hashtags: parsed.hashtags,
        recentContents,
    });
    emitQualityMetrics('thread', quality);

    if (quality.action === 'block') {
        metrics.incCounter(
            'nichebot_quality_regenerations_total',
            'Total regenerations triggered by quality guardrails',
            { type: 'thread', reason: 'red_flag' }
        );
        logger.warn('Thread kalite kontrolünde bloklandı, güvenli tekrar deneniyor.', {
            niche: nicheName,
            redFlags: summarizeRedFlags(quality.redFlags),
        });

        response = await chat(
            `${systemPrompt}\n${QUALITY_RETRY_APPENDIX}`,
            `${userMessage}\n\nRiskli/red-flag oluşturabilecek ifadeleri kullanmadan tekrar üret.`
        );
        parsed = parseThreadResponse(response);
        quality = evaluateThreadQuality({
            tweets: parsed.tweets,
            hashtags: parsed.hashtags,
            recentContents,
        });
        emitQualityMetrics('thread', quality);
    }

    if (quality.action === 'block') {
        throw new Error(`Thread kalite kontrolünü geçemedi: ${summarizeRedFlags(quality.redFlags)}`);
    }

    return {
        tweets: parsed.tweets,
        hashtags: parsed.hashtags,
        quality,
        prompt: buildPromptMetadata(templateInfo),
    };
}

/**
 * Tweet yanıtını parse et
 */
function parseTweetResponse(response) {
    const tweetMatch = response.match(/TWEET:\s*(.+?)(?=\nHASHTAGS:|$)/s);
    const hashtagMatch = response.match(/HASHTAGS:\s*(.+)/);

    const content = tweetMatch ? tweetMatch[1].trim() : response.trim();
    const hashtags = hashtagMatch ? hashtagMatch[1].trim() : '';

    return { content, hashtags };
}

/**
 * Thread yanıtını parse et
 */
function parseThreadResponse(response) {
    const threadMatch = response.match(/THREAD:\s*(.+?)(?=\nHASHTAGS:|$)/s);
    const hashtagMatch = response.match(/HASHTAGS:\s*(.+)/);

    const threadText = threadMatch ? threadMatch[1].trim() : response.trim();
    const tweets = threadText
        .split(/\n\d+\/\s*/)
        .filter((t) => t.trim())
        .map((t) => t.trim());

    const hashtags = hashtagMatch ? hashtagMatch[1].trim() : '';

    return { tweets, hashtags };
}

module.exports = { generateTweet, generateThread };
