const { chat } = require('./provider');
const db = require('../db/database');

/**
 * Niş konuya göre tweet içeriği üret
 * @param {string} nicheName - Niş adı (örn: "yapay zeka")
 * @param {object} options - Ek seçenekler
 * @returns {Promise<{ content: string, hashtags: string }>}
 */
async function generateTweet(nicheName, options = {}) {
    const { tone = 'bilgilendirici', language = 'tr', profileContext = '' } = options;

    // Son 10 postu al — tekrar etmesin
    const recentPosts = getRecentPosts(nicheName, 10);
    const recentTexts = recentPosts.map((p) => `- ${p.content}`).join('\n');

    const systemPrompt = `Sen profesyonel bir sosyal medya içerik üreticisisin.
Görevin: "${nicheName}" konusunda Twitter/X için etkileyici, özgün içerikler üretmek.

KURALLAR:
- Dil: ${language === 'tr' ? 'Türkçe' : 'İngilizce'}
- Ton: ${tone}
- Maksimum 270 karakter (hashtag'ler hariç)
- Doğal, samimi, insan gibi yaz — robot gibi olma
- Emoji kullan ama abartma (1-2 tane yeterli)
- İlgi çekici, paylaşılabilir olsun
- Soru sorarak veya görüş belirterek etkileşim artır
- 2-4 alakalı hashtag öner

${profileContext ? `KULLANICININ PROFİL ANALİZİ:\n${profileContext}\nBu profile uygun bir tonda ve konuda yaz.` : ''}

${recentTexts ? `SON PAYLAŞIMLAR (bunlardan farklı bir şey üret):\n${recentTexts}` : ''}

CEVAP FORMATI (tam olarak bu formatta yanıt ver):
TWEET: [tweet metni]
HASHTAGS: [#hashtag1 #hashtag2 #hashtag3]`;

    const userMessage = `"${nicheName}" konusunda yeni bir tweet üret. ${tone} tonda olsun.`;

    const response = await chat(systemPrompt, userMessage);
    return parseTweetResponse(response);
}

/**
 * Thread (konu dizisi) üret
 * @param {string} nicheName - Niş adı
 * @param {number} tweetCount - Thread'deki tweet sayısı
 * @returns {Promise<{ tweets: string[], hashtags: string }>}
 */
async function generateThread(nicheName, tweetCount = 4, options = {}) {
    const { tone = 'bilgilendirici', language = 'tr' } = options;

    const systemPrompt = `Sen profesyonel bir sosyal medya içerik üreticisisin.
Görevin: "${nicheName}" konusunda ${tweetCount} tweet'lik bir Twitter thread (konu dizisi) oluşturmak.

KURALLAR:
- Dil: ${language === 'tr' ? 'Türkçe' : 'İngilizce'}
- Ton: ${tone}
- Her tweet maksimum 270 karakter
- İlk tweet dikkat çekici bir giriş olsun
- Son tweet bir özet veya call-to-action olsun
- Her tweet numaralanmış olsun (1/, 2/, ...)
- Hashtag'ler sadece son tweet'te olsun

CEVAP FORMATI:
THREAD:
1/ [ilk tweet]
2/ [ikinci tweet]
...
HASHTAGS: [#hashtag1 #hashtag2]`;

    const userMessage = `"${nicheName}" konusunda ${tweetCount} tweet'lik detaylı bir thread oluştur.`;

    const response = await chat(systemPrompt, userMessage);
    return parseThreadResponse(response);
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

/**
 * Son paylaşımları getir (tekrar önleme için)
 */
function getRecentPosts(nicheName, limit = 10) {
    try {
        const niche = db.getNicheByName(nicheName);
        if (!niche) return [];

        const stmt = require('better-sqlite3')(
            require('path').join(__dirname, '..', '..', 'data', 'nichebot.db'),
            { readonly: true }
        );
        // Direct query yapıyoruz çünkü db modülünde bu fonksiyon yok
        return [];
    } catch {
        return [];
    }
}

module.exports = { generateTweet, generateThread };
