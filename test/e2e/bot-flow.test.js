const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');

const ENV_KEYS = [
    'NICHEBOT_HOME',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ALLOWED_USER_ID',
    'LLM_PROVIDER',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_MODEL',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
    'DEFAULT_LANGUAGE',
    'MAX_DAILY_POSTS',
    'PROMPT_TEMPLATE_VERSION',
    'QUALITY_MIN_AUTO_PUBLISH_SCORE',
    'LOG_LEVEL',
    'TZ',
    'NODE_ENV',
];

const SRC_PATHS = [
    'src/runtime/paths.js',
    'src/config.js',
    'src/db/database.js',
    'src/utils/i18n.js',
    'src/scheduler/cron.js',
    'src/telegram/bot.js',
    'src/llm/generator.js',
    'src/twitter/client.js',
    'src/twitter/analyzer.js',
];

function clearNichebotCaches() {
    SRC_PATHS.forEach((relativePath) => {
        const absolutePath = path.join(ROOT, relativePath);
        delete require.cache[absolutePath];
    });
}

function snapshotEnv() {
    const snapshot = {};
    ENV_KEYS.forEach((key) => {
        snapshot[key] = process.env[key];
        delete process.env[key];
    });
    return snapshot;
}

function restoreEnv(snapshot) {
    ENV_KEYS.forEach((key) => {
        if (snapshot[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = snapshot[key];
        }
    });
}

function writeRuntimeEnv(homeDir, options = {}) {
    const {
        allowedUserId = '123456789',
        includeTwitter = true,
        language = 'en',
    } = options;

    const envLines = [
        'TELEGRAM_BOT_TOKEN=test-telegram-token',
        `TELEGRAM_ALLOWED_USER_ID=${allowedUserId}`,
        'LLM_PROVIDER=deepseek',
        'DEEPSEEK_API_KEY=test-deepseek-key',
        `DEFAULT_LANGUAGE=${language}`,
        'MAX_DAILY_POSTS=5',
        'PROMPT_TEMPLATE_VERSION=v1',
        'QUALITY_MIN_AUTO_PUBLISH_SCORE=65',
        'LOG_LEVEL=error',
        'TZ=UTC',
        'NODE_ENV=test',
    ];

    if (includeTwitter) {
        envLines.push('TWITTER_API_KEY=test-twitter-key');
        envLines.push('TWITTER_API_SECRET=test-twitter-secret');
        envLines.push('TWITTER_ACCESS_TOKEN=test-twitter-access-token');
        envLines.push('TWITTER_ACCESS_SECRET=test-twitter-access-secret');
    }

    fs.writeFileSync(path.join(homeDir, '.env'), `${envLines.join('\n')}\n`);
}

function mockModule(relativePath, exportsValue) {
    const absolutePath = path.join(ROOT, relativePath);
    require.cache[absolutePath] = {
        id: absolutePath,
        filename: absolutePath,
        loaded: true,
        exports: exportsValue,
    };
}

class FakeTelegramBot {
    constructor(token, options = {}) {
        this.token = token;
        this.options = options;
        this.textHandlers = [];
        this.eventHandlers = new Map();
        this.sent = [];
    }

    onText(regex, callback) {
        this.textHandlers.push({ regex, callback });
    }

    on(event, callback) {
        const list = this.eventHandlers.get(event) || [];
        list.push(callback);
        this.eventHandlers.set(event, list);
    }

    async sendMessage(chatId, text, options = {}) {
        this.sent.push({ chatId, text: String(text), options: { ...options } });
        return { chat: { id: chatId }, text: String(text) };
    }

    stopPolling() {
        this.stopped = true;
    }

    async emitText(text, options = {}) {
        const msg = {
            chat: {
                id: options.chatId ?? 1001,
                type: 'private',
            },
            from: {
                id: options.userId ?? 123456789,
                is_bot: false,
                first_name: 'Tester',
            },
            text,
        };

        for (const handler of this.textHandlers) {
            handler.regex.lastIndex = 0;
            const match = text.match(handler.regex);
            if (match) {
                await handler.callback(msg, match);
            }
        }

        const messageHandlers = this.eventHandlers.get('message') || [];
        for (const callback of messageHandlers) {
            await callback(msg);
        }
    }
}

function installTelegramPackageMock() {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'node-telegram-bot-api') {
            return FakeTelegramBot;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    return () => {
        Module._load = originalLoad;
    };
}

function setupHarness(options = {}) {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-e2e-'));
    const envSnapshot = snapshotEnv();
    process.env.NICHEBOT_HOME = tempHome;
    writeRuntimeEnv(tempHome, options);

    clearNichebotCaches();

    const restoreTelegramLoad = installTelegramPackageMock();

    const tweetPublishes = [];
    const profileRequests = [];

    mockModule('src/llm/generator.js', {
        generateTweet: async () => ({
            content: 'Mock içerik _özel_ [link](https://example.com)',
            hashtags: '#nichebot #test',
        }),
        generateThread: async () => ({
            tweets: ['1/ Mock thread', '2/ Devam'],
            hashtags: '#thread',
        }),
    });

    mockModule('src/twitter/client.js', {
        postTweet: async (content) => {
            tweetPublishes.push(content);
            return { success: true, tweetId: '1234567890123456789' };
        },
        postThread: async () => ({ success: true, tweetIds: ['123', '124'] }),
        getMe: async () => ({ username: 'mock_owner', name: 'Mock Owner' }),
    });

    mockModule('src/twitter/analyzer.js', {
        analyzeProfile: async (username) => {
            profileRequests.push(username);
            return {
                username,
                topics: ['ai', 'automation'],
                tone: 'informative',
                analysis: 'Strong technical focus.',
                suggestions: ['More story-driven posts.'],
            };
        },
        formatAnalysisForTelegram: (analysis) =>
            `📊 *@${analysis.username} Profile Analysis*\n\n📝 *Analysis:*\n${analysis.analysis}`,
    });

    const configModule = require(path.join(ROOT, 'src/config.js'));
    configModule.reloadConfig({ override: true });

    const dbModule = require(path.join(ROOT, 'src/db/database.js'));
    const i18nModule = require(path.join(ROOT, 'src/utils/i18n.js'));
    const schedulerModule = require(path.join(ROOT, 'src/scheduler/cron.js'));
    const botModule = require(path.join(ROOT, 'src/telegram/bot.js'));
    const loggerModule = require(path.join(ROOT, 'src/utils/logger.js'));

    loggerModule.init('error');
    dbModule.initDatabase();
    i18nModule.init(configModule.config.defaultLanguage);

    const bot = botModule.initBot();

    return {
        bot,
        dbModule,
        schedulerModule,
        botModule,
        configModule,
        tweetPublishes,
        profileRequests,
        cleanup() {
            try {
                botModule.stopBot();
            } catch { }
            try {
                schedulerModule.stopAll();
            } catch { }
            try {
                dbModule.closeDatabase();
            } catch { }

            restoreTelegramLoad();
            clearNichebotCaches();
            restoreEnv(envSnapshot);
            fs.rmSync(tempHome, { recursive: true, force: true });
        },
    };
}

test('e2e: command flow with Telegram/Twitter mocks publishes content', { concurrency: false }, async () => {
    const harness = setupHarness({
        allowedUserId: '123456789',
        includeTwitter: true,
        language: 'en',
    });

    try {
        await harness.bot.emitText('/start', { userId: 123456789 });
        await harness.bot.emitText('/niche ai automation', { userId: 123456789 });
        await harness.bot.emitText('/uret', { userId: 123456789 });
        await harness.bot.emitText('/onayla', { userId: 123456789 });
        await harness.bot.emitText('/analiz testprofile', { userId: 123456789 });

        const sentTexts = harness.bot.sent.map((item) => item.text);
        assert.ok(sentTexts.some((text) => text.includes('Welcome to NicheBot')));
        assert.ok(sentTexts.some((text) => text.includes('Niche added')));
        assert.ok(sentTexts.some((text) => text.includes('Tweet Preview')));
        assert.ok(sentTexts.some((text) => text.includes('Successfully published')));
        assert.ok(sentTexts.some((text) => text.includes('Profile Analysis')));

        assert.equal(harness.tweetPublishes.length, 1);
        assert.equal(harness.profileRequests.includes('testprofile'), true);

        const stats = harness.dbModule.getPostStats();
        assert.equal(Number(stats.published || 0) >= 1, true);
    } finally {
        harness.cleanup();
    }
});

test('e2e: unauthorized user is blocked by strict access policy', { concurrency: false }, async () => {
    const harness = setupHarness({
        allowedUserId: '555555',
        includeTwitter: false,
        language: 'en',
    });

    try {
        await harness.bot.emitText('/start', { userId: 123456789 });

        const sentTexts = harness.bot.sent.map((item) => item.text);
        assert.ok(sentTexts.some((text) => text.includes('not authorized')));
        assert.equal(harness.dbModule.getAllNiches().length, 0);
    } finally {
        harness.cleanup();
    }
});
