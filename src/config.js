require('dotenv').config();

const config = {
    // Telegram
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID
            ? parseInt(process.env.TELEGRAM_ALLOWED_USER_ID)
            : null,
    },

    // LLM
    llm: {
        provider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(),
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        },
        deepseek: {
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        },
    },

    // Twitter
    twitter: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    },

    // Genel
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'tr',
    maxDailyPosts: (() => {
        const val = parseInt(process.env.MAX_DAILY_POSTS);
        return Number.isFinite(val) && val > 0 ? val : 5;
    })(),
    logLevel: process.env.LOG_LEVEL || 'info',
    timezone: process.env.TZ || 'UTC',
    nodeEnv: process.env.NODE_ENV || 'development',
};

/**
 * API anahtarlarının geçerliliğini kontrol et
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateConfig() {
    const errors = [];
    const warnings = [];

    // Telegram zorunlu
    if (!config.telegram.token) {
        errors.push('TELEGRAM_BOT_TOKEN required. Get it from @BotFather.');
    }

    if (config.telegram.allowedUserId && isNaN(config.telegram.allowedUserId)) {
        errors.push('TELEGRAM_ALLOWED_USER_ID must be a number.');
    }

    // LLM zorunlu
    const provider = config.llm.provider;
    const validProviders = ['openai', 'anthropic', 'deepseek'];

    if (!validProviders.includes(provider)) {
        errors.push(`Invalid LLM_PROVIDER: "${provider}". Options: ${validProviders.join(', ')}`);
    } else {
        const providerConfig = config.llm[provider];
        if (!providerConfig?.apiKey) {
            errors.push(`${provider.toUpperCase()}_API_KEY required. LLM_PROVIDER="${provider}" is set but no API key found.`);
        }
    }

    // Twitter opsiyonel
    const tw = config.twitter;
    const twitterKeys = [tw.apiKey, tw.apiSecret, tw.accessToken, tw.accessSecret];
    const hasAny = twitterKeys.some(Boolean);
    const hasAll = twitterKeys.every(Boolean);

    if (hasAny && !hasAll) {
        errors.push('Twitter API: All 4 keys required (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET)');
    }

    if (!hasAny) {
        warnings.push('Twitter API not configured. Bot will generate content but cannot publish. Add Twitter keys to .env to enable posting.');
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Twitter API'nin yapılandırılıp yapılandırılmadığını kontrol et
 */
function isTwitterConfigured() {
    const tw = config.twitter;
    return !!(tw.apiKey && tw.apiSecret && tw.accessToken && tw.accessSecret);
}

/**
 * Aktif LLM provider bilgisini döndür
 */
function getActiveProvider() {
    const provider = config.llm.provider;
    return {
        name: provider,
        model: config.llm[provider]?.model || 'unknown',
    };
}

module.exports = { config, validateConfig, isTwitterConfigured, getActiveProvider };
