const fs = require('fs');
const dotenv = require('dotenv');
const { envPath } = require('./runtime/paths');

const VALID_PROVIDERS = ['openai', 'anthropic', 'deepseek'];

const config = {};

function loadEnv(options = {}) {
    const { override = true } = options;
    if (!fs.existsSync(envPath)) {
        return { loaded: false, path: envPath, error: null };
    }

    const result = dotenv.config({ path: envPath, override });
    return {
        loaded: !result.error,
        path: envPath,
        error: result.error || null,
    };
}

function parseAllowedUserId(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) {
        return { raw: '', parsed: null, isValid: false, reason: 'missing' };
    }

    if (!/^\d+$/.test(value)) {
        return { raw: value, parsed: null, isValid: false, reason: 'nan' };
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return { raw: value, parsed: null, isValid: false, reason: 'range' };
    }

    return { raw: value, parsed, isValid: true, reason: null };
}

function parseBoolean(rawValue, defaultValue = false) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return Boolean(defaultValue);
    const value = String(rawValue).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(value)) return false;
    return Boolean(defaultValue);
}

function buildConfigFromEnv() {
    const parsedAllowedUser = parseAllowedUserId(process.env.TELEGRAM_ALLOWED_USER_ID);
    const maxDailyPostsRaw = Number.parseInt(process.env.MAX_DAILY_POSTS, 10);

    const observabilityPortRaw = Number.parseInt(process.env.OBSERVABILITY_PORT, 10);

    return {
        // Telegram
        telegram: {
            token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
            allowedUserId: parsedAllowedUser.parsed,
            allowedUserIdRaw: parsedAllowedUser.raw,
        },

        // LLM
        llm: {
            provider: String(process.env.LLM_PROVIDER || 'openai').trim().toLowerCase(),
            openai: {
                apiKey: String(process.env.OPENAI_API_KEY || '').trim(),
                model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
            },
            anthropic: {
                apiKey: String(process.env.ANTHROPIC_API_KEY || '').trim(),
                model: String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514').trim(),
            },
            deepseek: {
                apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim(),
                model: String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim(),
            },
        },

        // Twitter
        twitter: {
            apiKey: String(process.env.TWITTER_API_KEY || '').trim(),
            apiSecret: String(process.env.TWITTER_API_SECRET || '').trim(),
            accessToken: String(process.env.TWITTER_ACCESS_TOKEN || '').trim(),
            accessSecret: String(process.env.TWITTER_ACCESS_SECRET || '').trim(),
        },

        // General
        defaultLanguage: String(process.env.DEFAULT_LANGUAGE || 'tr').trim().toLowerCase(),
        maxDailyPosts: Number.isFinite(maxDailyPostsRaw) && maxDailyPostsRaw > 0 ? maxDailyPostsRaw : 5,
        logLevel: String(process.env.LOG_LEVEL || 'info').trim().toLowerCase(),
        timezone: String(process.env.TZ || 'UTC').trim(),
        nodeEnv: String(process.env.NODE_ENV || 'development').trim().toLowerCase(),
        observability: {
            enabled: parseBoolean(process.env.OBSERVABILITY_ENABLED, true),
            host: String(process.env.OBSERVABILITY_HOST || '127.0.0.1').trim(),
            port: Number.isFinite(observabilityPortRaw) ? observabilityPortRaw : 9464,
            token: String(process.env.OBSERVABILITY_TOKEN || '').trim(),
        },

        // Internal metadata
        _meta: {
            envPath,
            allowedUserIdValidation: parsedAllowedUser,
        },
    };
}

function syncConfig(nextConfig) {
    Object.keys(config).forEach((key) => delete config[key]);
    Object.assign(config, nextConfig);
    return config;
}

function reloadConfig(options = {}) {
    loadEnv({ override: options.override ?? true });
    return syncConfig(buildConfigFromEnv());
}

function addIssue(target, issue) {
    target.push({
        code: issue.code,
        field: issue.field,
        message: issue.message,
        fix: issue.fix,
    });
}

/**
 * Configuration validation with actionable fixes.
 * @returns {{ valid: boolean, errors: Array, warnings: Array, envPath: string }}
 */
function validateConfig() {
    const errors = [];
    const warnings = [];
    const currentConfig = config;

    if (!currentConfig.telegram.token) {
        addIssue(errors, {
            code: 'MISSING_TELEGRAM_BOT_TOKEN',
            field: 'TELEGRAM_BOT_TOKEN',
            message: 'TELEGRAM_BOT_TOKEN is required.',
            fix: `Set TELEGRAM_BOT_TOKEN in ${envPath} (or run: nichebot setup).`,
        });
    }

    const allowedUserValidation = currentConfig._meta.allowedUserIdValidation;
    if (allowedUserValidation.reason === 'missing') {
        addIssue(errors, {
            code: 'MISSING_ALLOWED_USER_ID',
            field: 'TELEGRAM_ALLOWED_USER_ID',
            message: 'TELEGRAM_ALLOWED_USER_ID is required in strict single-user mode.',
            fix: 'Set your numeric Telegram user id (example: TELEGRAM_ALLOWED_USER_ID=123456789).',
        });
    } else if (!allowedUserValidation.isValid) {
        addIssue(errors, {
            code: 'INVALID_ALLOWED_USER_ID',
            field: 'TELEGRAM_ALLOWED_USER_ID',
            message: `TELEGRAM_ALLOWED_USER_ID is invalid: "${allowedUserValidation.raw}".`,
            fix: 'Use a positive integer value from @userinfobot.',
        });
    }

    const provider = currentConfig.llm.provider;
    if (!VALID_PROVIDERS.includes(provider)) {
        addIssue(errors, {
            code: 'INVALID_LLM_PROVIDER',
            field: 'LLM_PROVIDER',
            message: `Invalid LLM_PROVIDER: "${provider}".`,
            fix: `Use one of: ${VALID_PROVIDERS.join(', ')}.`,
        });
    } else {
        const providerConfig = currentConfig.llm[provider];
        if (!providerConfig?.apiKey) {
            addIssue(errors, {
                code: 'MISSING_LLM_API_KEY',
                field: `${provider.toUpperCase()}_API_KEY`,
                message: `LLM_PROVIDER="${provider}" requires ${provider.toUpperCase()}_API_KEY.`,
                fix: `Set ${provider.toUpperCase()}_API_KEY in ${envPath} (or run: nichebot setup).`,
            });
        }
    }

    if (!['tr', 'en'].includes(currentConfig.defaultLanguage)) {
        addIssue(errors, {
            code: 'INVALID_DEFAULT_LANGUAGE',
            field: 'DEFAULT_LANGUAGE',
            message: `DEFAULT_LANGUAGE must be "tr" or "en", got "${currentConfig.defaultLanguage}".`,
            fix: 'Set DEFAULT_LANGUAGE=tr or DEFAULT_LANGUAGE=en.',
        });
    }

    const tw = currentConfig.twitter;
    const twitterKeys = [tw.apiKey, tw.apiSecret, tw.accessToken, tw.accessSecret];
    const hasAnyTwitterKey = twitterKeys.some(Boolean);
    const hasAllTwitterKeys = twitterKeys.every(Boolean);

    if (hasAnyTwitterKey && !hasAllTwitterKeys) {
        addIssue(errors, {
            code: 'PARTIAL_TWITTER_CONFIG',
            field: 'TWITTER_*',
            message: 'Twitter API configuration is incomplete.',
            fix: 'Set all four keys: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET.',
        });
    } else if (!hasAnyTwitterKey) {
        addIssue(warnings, {
            code: 'TWITTER_DISABLED',
            field: 'TWITTER_*',
            message: 'Twitter API is not configured. Generation works, publish commands remain disabled.',
            fix: 'Optional: add Twitter keys to enable /onayla publish actions.',
        });
    }

    const obs = currentConfig.observability || {};
    if (!Number.isInteger(obs.port) || obs.port < 1 || obs.port > 65535) {
        addIssue(errors, {
            code: 'INVALID_OBSERVABILITY_PORT',
            field: 'OBSERVABILITY_PORT',
            message: `OBSERVABILITY_PORT must be between 1 and 65535, got "${obs.port}".`,
            fix: 'Set OBSERVABILITY_PORT to a valid TCP port (example: 9464).',
        });
    }

    if (obs.enabled && obs.host === '0.0.0.0' && !obs.token) {
        addIssue(warnings, {
            code: 'OBSERVABILITY_EXPOSED_NO_TOKEN',
            field: 'OBSERVABILITY_TOKEN',
            message: 'Observability is exposed on 0.0.0.0 without OBSERVABILITY_TOKEN.',
            fix: 'Set OBSERVABILITY_TOKEN or bind OBSERVABILITY_HOST to 127.0.0.1.',
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        envPath,
    };
}

function formatValidationReport(validation) {
    const lines = [];
    lines.push(`Config file: ${validation.envPath}`);

    if (validation.errors.length > 0) {
        lines.push('\nErrors:');
        validation.errors.forEach((err, index) => {
            lines.push(`${index + 1}. [${err.code}] ${err.message}`);
            lines.push(`   Fix: ${err.fix}`);
        });
    }

    if (validation.warnings.length > 0) {
        lines.push('\nWarnings:');
        validation.warnings.forEach((warn, index) => {
            lines.push(`${index + 1}. [${warn.code}] ${warn.message}`);
            lines.push(`   Note: ${warn.fix}`);
        });
    }

    if (validation.valid) {
        lines.push('\nConfiguration status: OK');
    }

    return lines.join('\n');
}

function isTwitterConfigured() {
    const tw = config.twitter || {};
    return !!(tw.apiKey && tw.apiSecret && tw.accessToken && tw.accessSecret);
}

function getActiveProvider() {
    const provider = config.llm?.provider || 'openai';
    return {
        name: provider,
        model: config.llm?.[provider]?.model || 'unknown',
    };
}

loadEnv({ override: false });
syncConfig(buildConfigFromEnv());

module.exports = {
    config,
    envPath,
    loadEnv,
    reloadConfig,
    validateConfig,
    formatValidationReport,
    isTwitterConfigured,
    getActiveProvider,
};
