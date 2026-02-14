const { TwitterApi } = require('twitter-api-v2');
const { config, isTwitterConfigured } = require('../config');

let client = null;

/**
 * Twitter client'ı başlat
 */
function initTwitterClient() {
    if (!isTwitterConfigured()) {
        console.log('⚠️  Twitter API yapılandırılmamış. Sadece içerik üretim modu aktif.');
        return null;
    }

    try {
        client = new TwitterApi({
            appKey: config.twitter.apiKey,
            appSecret: config.twitter.apiSecret,
            accessToken: config.twitter.accessToken,
            accessSecret: config.twitter.accessSecret,
        });

        console.log('✅ Twitter API bağlantısı hazır');
        return client;
    } catch (error) {
        console.error('❌ Twitter API bağlantı hatası:', error.message);
        return null;
    }
}

/**
 * Tweet paylaş
 * @param {string} content - Tweet içeriği
 * @returns {Promise<{ success: boolean, tweetId?: string, error?: string }>}
 */
async function postTweet(content) {
    if (!client) {
        return { success: false, error: 'Twitter API bağlı değil. .env dosyasına Twitter anahtarlarını ekleyin.' };
    }

    try {
        const tweet = await client.v2.tweet(content);
        return { success: true, tweetId: tweet.data.id };
    } catch (error) {
        console.error('Tweet paylaşma hatası:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Thread (konu dizisi) paylaş
 * @param {string[]} tweets - Tweet listesi
 * @returns {Promise<{ success: boolean, tweetIds?: string[], error?: string }>}
 */
async function postThread(tweets) {
    if (!client) {
        return { success: false, error: 'Twitter API bağlı değil.' };
    }

    try {
        const tweetIds = [];
        let replyToId = null;

        for (const text of tweets) {
            const options = replyToId
                ? { reply: { in_reply_to_tweet_id: replyToId } }
                : {};

            const tweet = await client.v2.tweet(text, options);
            tweetIds.push(tweet.data.id);
            replyToId = tweet.data.id;
        }

        return { success: true, tweetIds };
    } catch (error) {
        console.error('Thread paylaşma hatası:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Kullanıcının profilini ve son tweetlerini çek
 * @param {string} username - Twitter kullanıcı adı
 * @returns {Promise<{ user: object, tweets: object[] } | null>}
 */
async function getUserProfile(username) {
    if (!client) return null;

    try {
        // Kullanıcı bilgisi
        const user = await client.v2.userByUsername(username, {
            'user.fields': ['description', 'public_metrics', 'created_at'],
        });

        // Son tweetler
        const tweets = await client.v2.userTimeline(user.data.id, {
            max_results: 20,
            'tweet.fields': ['public_metrics', 'created_at'],
        });

        return {
            user: user.data,
            tweets: tweets.data?.data || [],
        };
    } catch (error) {
        console.error('Profil çekme hatası:', error.message);
        return null;
    }
}

/**
 * Bağlı hesabın kim olduğunu kontrol et
 * @returns {Promise<{ username: string, name: string } | null>}
 */
async function getMe() {
    if (!client) return null;

    try {
        const me = await client.v2.me();
        return { username: me.data.username, name: me.data.name };
    } catch (error) {
        return null;
    }
}

module.exports = { initTwitterClient, postTweet, postThread, getUserProfile, getMe };
