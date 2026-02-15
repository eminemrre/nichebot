const { TwitterApi } = require('twitter-api-v2');
const { config, isTwitterConfigured } = require('../config');
const { retry } = require('../utils/helpers');
const logger = require('../utils/logger');
const metrics = require('../observability/metrics');

let client = null;

/**
 * Twitter client'ı başlat
 */
function initTwitterClient() {
    if (!isTwitterConfigured()) {
        metrics.setGauge(
            'nichebot_twitter_configured',
            'Whether Twitter integration is configured',
            {},
            0
        );
        logger.warn('Twitter API yapılandırılmamış. Sadece içerik üretim modu aktif.');
        return null;
    }

    try {
        client = new TwitterApi({
            appKey: config.twitter.apiKey,
            appSecret: config.twitter.apiSecret,
            accessToken: config.twitter.accessToken,
            accessSecret: config.twitter.accessSecret,
        });

        metrics.setGauge(
            'nichebot_twitter_configured',
            'Whether Twitter integration is configured',
            {},
            1
        );
        logger.info('Twitter API bağlantısı hazır');
        return client;
    } catch (error) {
        metrics.setGauge(
            'nichebot_twitter_configured',
            'Whether Twitter integration is configured',
            {},
            0
        );
        logger.error('Twitter API bağlantı hatası', { error: error.message });
        return null;
    }
}

/**
 * Tweet paylaş (retry ile)
 */
async function postTweet(content) {
    metrics.incCounter('nichebot_twitter_publish_attempts_total', 'Total tweet publish attempts', { type: 'tweet' });
    if (!client) {
        metrics.incCounter('nichebot_twitter_publish_failures_total', 'Total tweet publish failures', {
            type: 'tweet',
            reason: 'not_configured',
        });
        return { success: false, error: 'Twitter API bağlı değil.' };
    }

    try {
        const tweet = await retry(
            () => client.v2.tweet(content),
            {
                maxRetries: 2,
                baseDelay: 2000,
                onRetry: (err, attempt) => logger.warn(`Tweet retry ${attempt}: ${err.message}`),
            }
        );
        logger.info('Tweet paylaşıldı', { tweetId: tweet.data.id });
        metrics.incCounter('nichebot_twitter_publish_success_total', 'Total successful Twitter publishes', {
            type: 'tweet',
        });
        return { success: true, tweetId: tweet.data.id };
    } catch (error) {
        metrics.incCounter('nichebot_twitter_publish_failures_total', 'Total tweet publish failures', {
            type: 'tweet',
            reason: 'api_error',
        });
        logger.error('Tweet paylaşma hatası', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Thread paylaş (retry ile)
 */
async function postThread(tweets) {
    metrics.incCounter('nichebot_twitter_publish_attempts_total', 'Total tweet publish attempts', { type: 'thread' });
    if (!client) {
        metrics.incCounter('nichebot_twitter_publish_failures_total', 'Total tweet publish failures', {
            type: 'thread',
            reason: 'not_configured',
        });
        return { success: false, error: 'Twitter API bağlı değil.' };
    }

    try {
        const tweetIds = [];
        let replyToId = null;

        for (const text of tweets) {
            const options = replyToId
                ? { reply: { in_reply_to_tweet_id: replyToId } }
                : {};

            const tweet = await retry(
                () => client.v2.tweet(text, options),
                {
                    maxRetries: 2,
                    baseDelay: 2000,
                    onRetry: (err, attempt) => logger.warn(`Thread tweet retry ${attempt}: ${err.message}`),
                }
            );
            tweetIds.push(tweet.data.id);
            replyToId = tweet.data.id;
        }

        logger.info('Thread paylaşıldı', { count: tweetIds.length });
        metrics.incCounter('nichebot_twitter_publish_success_total', 'Total successful Twitter publishes', {
            type: 'thread',
        });
        return { success: true, tweetIds };
    } catch (error) {
        metrics.incCounter('nichebot_twitter_publish_failures_total', 'Total tweet publish failures', {
            type: 'thread',
            reason: 'api_error',
        });
        logger.error('Thread paylaşma hatası', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Kullanıcının profilini ve son tweetlerini çek
 */
async function getUserProfile(username) {
    if (!client) return null;

    try {
        const user = await client.v2.userByUsername(username, {
            'user.fields': ['description', 'public_metrics', 'created_at'],
        });

        const tweets = await client.v2.userTimeline(user.data.id, {
            max_results: 20,
            'tweet.fields': ['public_metrics', 'created_at'],
        });

        return {
            user: user.data,
            tweets: tweets.data?.data || [],
        };
    } catch (error) {
        logger.error('Profil çekme hatası', { username, error: error.message });
        return null;
    }
}

/**
 * Bağlı hesabın kim olduğunu kontrol et
 */
async function getMe() {
    if (!client) return null;

    try {
        const me = await client.v2.me();
        return { username: me.data.username, name: me.data.name };
    } catch {
        return null;
    }
}

module.exports = { initTwitterClient, postTweet, postThread, getUserProfile, getMe };
