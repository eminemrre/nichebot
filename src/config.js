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
    maxDailyPosts: parseInt(process.env.MAX_DAILY_POSTS) || 5,
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
        errors.push('❌ TELEGRAM_BOT_TOKEN gerekli. @BotFather\'dan alabilirsiniz.');
    }

    // LLM zorunlu — en az biri
    const provider = config.llm.provider;
    const providerConfig = config.llm[provider];

    if (!providerConfig) {
        errors.push(`❌ Geçersiz LLM_PROVIDER: "${provider}". Seçenekler: openai, anthropic, deepseek`);
    } else if (!providerConfig.apiKey) {
        errors.push(`❌ ${provider.toUpperCase()}_API_KEY gerekli. LLM_PROVIDER="${provider}" seçili ama API key yok.`);
    }

    // Twitter opsiyonel
    const tw = config.twitter;
    const hasAnyTwitter = tw.apiKey || tw.apiSecret || tw.accessToken || tw.accessSecret;
    const hasAllTwitter = tw.apiKey && tw.apiSecret && tw.accessToken && tw.accessSecret;

    if (hasAnyTwitter && !hasAllTwitter) {
        errors.push('❌ Twitter API: 4 anahtarın hepsi gerekli (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET)');
    }

    if (!hasAnyTwitter) {
        warnings.push('⚠️  Twitter API bağlı değil. Bot içerik üretir ama paylaşamaz. Twitter\'a paylaşmak için .env dosyasına Twitter anahtarlarını ekleyin.');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
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
