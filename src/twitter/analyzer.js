const { chat } = require('../llm/provider');
const { getUserProfile } = require('./client');
const db = require('../db/database');

/**
 * Twitter profilini analiz et ve içerik stratejisi öner
 * @param {string} username - Twitter kullanıcı adı (@'sız)
 * @returns {Promise<object>} Analiz sonuçları
 */
async function analyzeProfile(username) {
    // Twitter'dan profil ve tweetleri çek
    const profile = await getUserProfile(username);

    if (!profile) {
        throw new Error(
            'Twitter profili çekilemedi. Twitter API anahtarlarınızı kontrol edin veya kullanıcı adını doğru yazdığınızdan emin olun.'
        );
    }

    const { user, tweets } = profile;

    // Tweet metinlerini hazırla
    const tweetTexts = tweets
        .slice(0, 15)
        .map((t, i) => `${i + 1}. ${t.text} (❤️ ${t.public_metrics?.like_count || 0}, 🔄 ${t.public_metrics?.retweet_count || 0})`)
        .join('\n');

    const systemPrompt = `Sen sosyal medya analisti ve içerik stratejistisin.
Bir Twitter/X kullanıcısının profilini ve son tweetlerini analiz edeceksin.

Analiz sonucunda şunları belirle:
1. Ana konular/nişler (en çok hangi konularda paylaşım yapıyor)
2. Yazım tonu (resmi, samimi, eğlenceli, bilgilendirici, tartışmacı vb.)
3. En çok etkileşim alan içerik tipleri
4. Güçlü yönleri
5. İyileştirme önerileri
6. İçerik stratejisi önerisi (hangi konularda, hangi tonda, ne sıklıkla paylaşmalı)

CEVAP TÜRKÇE OLSUN.

CEVAP FORMATI:
KONULAR: [konu1, konu2, konu3]
TON: [ana ton]
ANALİZ: [detaylı analiz]
ÖNERİLER: [madde madde öneriler]`;

    const userMessage = `Kullanıcı: @${user.username}
Bio: ${user.description || 'Yok'}
Takipçi: ${user.public_metrics?.followers_count || 0}
Takip: ${user.public_metrics?.following_count || 0}
Tweet sayısı: ${user.public_metrics?.tweet_count || 0}

SON TWEETLER:
${tweetTexts || 'Tweet bulunamadı'}`;

    const response = await chat(systemPrompt, userMessage);

    // Yanıtı parse et
    const result = parseAnalysisResponse(response, username);

    // Veritabanına kaydet
    db.saveProfileAnalysis(
        username,
        result.analysis,
        result.topics,
        result.tone,
        result.suggestions
    );

    return result;
}

/**
 * Analiz yanıtını parse et
 */
function parseAnalysisResponse(response, username) {
    const topicsMatch = response.match(/KONULAR:\s*\[?(.+?)\]?\n/);
    const toneMatch = response.match(/TON:\s*\[?(.+?)\]?\n/);
    const analysisMatch = response.match(/ANALİZ:\s*(.+?)(?=\nÖNERİLER:|$)/s);
    const suggestionsMatch = response.match(/ÖNERİLER:\s*(.+)/s);

    return {
        username,
        topics: topicsMatch
            ? topicsMatch[1].split(',').map((t) => t.trim())
            : [],
        tone: toneMatch ? toneMatch[1].trim() : 'bilinmiyor',
        analysis: analysisMatch ? analysisMatch[1].trim() : response,
        suggestions: suggestionsMatch
            ? suggestionsMatch[1]
                .split('\n')
                .filter((s) => s.trim())
                .map((s) => s.replace(/^[-•*]\s*/, '').trim())
            : [],
    };
}

/**
 * Profil analizini Telegram için formatlı metin olarak döndür
 */
function formatAnalysisForTelegram(analysis) {
    let text = `📊 *@${analysis.username} Profil Analizi*\n\n`;

    text += `🏷 *Konular:* ${analysis.topics.join(', ')}\n`;
    text += `🎭 *Ton:* ${analysis.tone}\n\n`;

    text += `📝 *Analiz:*\n${analysis.analysis}\n\n`;

    if (analysis.suggestions.length > 0) {
        text += `💡 *Öneriler:*\n`;
        analysis.suggestions.forEach((s, i) => {
            text += `${i + 1}. ${s}\n`;
        });
    }

    return text;
}

module.exports = { analyzeProfile, formatAnalysisForTelegram };
