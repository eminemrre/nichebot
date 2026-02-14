const TelegramBot = require('node-telegram-bot-api');
const { config, validateConfig, isTwitterConfigured, getActiveProvider } = require('../config');
const { generateTweet, generateThread } = require('../llm/generator');
const { postTweet, postThread, getMe } = require('../twitter/client');
const { analyzeProfile, formatAnalysisForTelegram } = require('../twitter/analyzer');
const { addAndStartSchedule, getActiveJobCount } = require('../scheduler/cron');
const db = require('../db/database');

let bot;
let pendingPost = null; // Onay bekleyen post

/**
 * Telegram botunu başlat
 */
function initBot() {
    bot = new TelegramBot(config.telegram.token, { polling: true });

    // Yetkisiz kullanıcıları engelle
    bot.on('message', (msg) => {
        if (config.telegram.allowedUserId && msg.from.id !== config.telegram.allowedUserId) {
            bot.sendMessage(msg.chat.id, '🚫 Bu botu kullanma yetkiniz yok.');
            return;
        }
    });

    registerCommands();
    console.log('✅ Telegram botu başlatıldı');
    return bot;
}

/**
 * Tüm komutları kaydet
 */
function registerCommands() {
    // /start — Hoş geldin + durum
    bot.onText(/\/start/, async (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const provider = getActiveProvider();
        const twitterUser = await getMe();

        let text = `🤖 *NicheBot'a Hoş Geldiniz!*\n\n`;
        text += `AI destekli sosyal medya içerik asistanınız.\n\n`;
        text += `📡 *Bağlantı Durumu:*\n`;
        text += `  🧠 LLM: ✅ ${provider.name} (${provider.model})\n`;
        text += twitterUser
            ? `  🐦 Twitter: ✅ @${twitterUser.username}\n`
            : `  🐦 Twitter: ❌ Bağlı değil\n`;
        text += `  📅 Aktif Görev: ${getActiveJobCount()}\n\n`;

        text += `📋 *Komutlar:*\n`;
        text += `/niche <konu> — Niş konu ekle\n`;
        text += `/nisler — Aktif nişleri listele\n`;
        text += `/sil <konu> — Niş kaldır\n`;
        text += `/uret — Tweet üret + önizle\n`;
        text += `/thread <sayı> — Thread üret\n`;
        text += `/onayla — Tweeti paylaş\n`;
        text += `/reddet — Yenisini üret\n`;
        text += `/analiz <kullanıcı> — Profil analizi\n`;
        text += `/zamanlama — Otomatik paylaşım ayarla\n`;
        text += `/durum — İstatistikler\n`;
        text += `/yardim — Detaylı yardım`;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });

    // /niche <konu> — Niş ekle
    bot.onText(/\/niche (.+)/, (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const nicheName = match[1].trim();

        const niche = db.addNiche(nicheName);
        if (niche) {
            bot.sendMessage(chatId, `✅ Niş eklendi: *${niche.name}*\n\nŞimdi \`/uret\` ile içerik üretebilirsiniz.`, {
                parse_mode: 'Markdown',
            });
        } else {
            bot.sendMessage(chatId, `⚠️ "${nicheName}" zaten mevcut.`);
        }
    });

    // /nisler — Nişleri listele
    bot.onText(/\/nisler/, (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const niches = db.getAllNiches();

        if (niches.length === 0) {
            bot.sendMessage(chatId, '📭 Henüz niş eklenmemiş.\n\n`/niche yapay zeka` komutuyla başlayın!', {
                parse_mode: 'Markdown',
            });
            return;
        }

        let text = `🏷 *Aktif Nişler (${niches.length}):*\n\n`;
        niches.forEach((n, i) => {
            text += `${i + 1}. *${n.name}* — ${n.tone}\n`;
        });
        text += `\nNiş silmek için: \`/sil <konu>\``;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });

    // /sil <konu> — Niş sil
    bot.onText(/\/sil (.+)/, (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const nicheName = match[1].trim();

        if (db.removeNiche(nicheName)) {
            bot.sendMessage(chatId, `🗑 Niş silindi: *${nicheName}*`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `❌ "${nicheName}" bulunamadı.`);
        }
    });

    // /uret — Tweet üret
    bot.onText(/\/uret(?:\s+(.+))?/, async (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            bot.sendMessage(chatId, '❌ Önce bir niş ekleyin: `/niche yapay zeka`', { parse_mode: 'Markdown' });
            return;
        }

        // Niş seçimi: parametre veya ilk niş
        const nicheName = match?.[1]?.trim() || niches[0].name;
        const niche = db.getNicheByName(nicheName);

        if (!niche) {
            bot.sendMessage(chatId, `❌ "${nicheName}" nişi bulunamadı.\nMevcut nişler: ${niches.map((n) => n.name).join(', ')}`);
            return;
        }

        bot.sendMessage(chatId, `🔄 İçerik üretiliyor: *${niche.name}*...`, { parse_mode: 'Markdown' });

        try {
            // Profil analizi varsa bağlam olarak kullan
            const profileAnalysis = db.getLatestProfileAnalysis(
                db.getSetting('twitter_username', '')
            );
            const profileContext = profileAnalysis ? profileAnalysis.analysis : '';

            const result = await generateTweet(niche.name, {
                tone: niche.tone,
                language: config.defaultLanguage,
                profileContext,
            });

            const fullContent = result.hashtags
                ? `${result.content}\n\n${result.hashtags}`
                : result.content;

            // Taslak olarak kaydet
            const saved = db.savePost(niche.id, fullContent, 'tweet', 'draft');

            // Onay beklet
            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                nicheName: niche.name,
            };

            let preview = `📝 *Tweet Önizleme:*\n\n${fullContent}\n\n`;
            preview += `📌 Niş: ${niche.name}\n`;
            preview += `📏 ${fullContent.length} karakter\n\n`;
            preview += `✅ /onayla — Paylaş\n`;
            preview += `🔄 /reddet — Yenisini üret\n`;
            preview += `✏️ Veya düzenlenmiş halini metin olarak gönderin`;

            bot.sendMessage(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ İçerik üretme hatası: ${error.message}`);
        }
    });

    // /thread — Thread üret
    bot.onText(/\/thread(?:\s+(\d+))?/, async (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const count = parseInt(match?.[1]) || 4;

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            bot.sendMessage(chatId, '❌ Önce bir niş ekleyin: `/niche yapay zeka`', { parse_mode: 'Markdown' });
            return;
        }

        const niche = niches[0];
        bot.sendMessage(chatId, `🔄 ${count} tweet'lik thread üretiliyor: *${niche.name}*...`, {
            parse_mode: 'Markdown',
        });

        try {
            const result = await generateThread(niche.name, count, {
                tone: niche.tone,
                language: config.defaultLanguage,
            });

            let preview = `🧵 *Thread Önizleme (${result.tweets.length} tweet):*\n\n`;
            result.tweets.forEach((t, i) => {
                preview += `*${i + 1}/${result.tweets.length}* ${t}\n\n`;
            });
            if (result.hashtags) {
                preview += `${result.hashtags}\n\n`;
            }
            preview += `✅ /onayla — Paylaş\n🔄 /reddet — Yenisini üret`;

            // Thread'i pending olarak kaydet
            const fullContent = result.tweets.join('\n---\n');
            const saved = db.savePost(niche.id, fullContent, 'thread', 'draft');

            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                tweets: result.tweets,
                hashtags: result.hashtags,
                nicheName: niche.name,
                type: 'thread',
            };

            bot.sendMessage(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Thread üretme hatası: ${error.message}`);
        }
    });

    // /onayla — Paylaş
    bot.onText(/\/onayla/, async (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;

        if (!pendingPost) {
            bot.sendMessage(chatId, '❌ Onaylanacak içerik yok. Önce `/uret` ile içerik üretin.', {
                parse_mode: 'Markdown',
            });
            return;
        }

        if (!isTwitterConfigured()) {
            bot.sendMessage(
                chatId,
                '⚠️ Twitter API bağlı değil. İçerik kaydedildi ama paylaşılamıyor.\n\n' +
                '.env dosyasına Twitter anahtarlarını ekleyip botu yeniden başlatın.'
            );
            pendingPost = null;
            return;
        }

        bot.sendMessage(chatId, '🚀 Paylaşılıyor...');

        try {
            let result;

            if (pendingPost.type === 'thread' && pendingPost.tweets) {
                // Thread paylaş
                const tweetsWithHashtags = [...pendingPost.tweets];
                if (pendingPost.hashtags) {
                    tweetsWithHashtags[tweetsWithHashtags.length - 1] += `\n\n${pendingPost.hashtags}`;
                }
                result = await postThread(tweetsWithHashtags);
            } else {
                // Tek tweet paylaş
                result = await postTweet(pendingPost.content);
            }

            if (result.success) {
                db.markPostAsPublished(pendingPost.id, result.tweetId || result.tweetIds?.[0]);

                const tweetId = result.tweetId || result.tweetIds?.[0];
                bot.sendMessage(
                    chatId,
                    `✅ *Başarıyla paylaşıldı!*\n\n🔗 https://twitter.com/i/status/${tweetId}`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                bot.sendMessage(chatId, `❌ Paylaşma hatası: ${result.error}`);
            }
        } catch (error) {
            bot.sendMessage(chatId, `❌ Hata: ${error.message}`);
        }

        pendingPost = null;
    });

    // /reddet — Yenisini üret
    bot.onText(/\/reddet/, async (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;

        if (!pendingPost) {
            bot.sendMessage(chatId, '❌ Reddedilecek içerik yok.');
            return;
        }

        const nicheName = pendingPost.nicheName;
        pendingPost = null;

        // Otomatik yenisini üret
        bot.sendMessage(chatId, `🔄 Yeni içerik üretiliyor: *${nicheName}*...`, { parse_mode: 'Markdown' });

        try {
            const result = await generateTweet(nicheName);
            const fullContent = result.hashtags
                ? `${result.content}\n\n${result.hashtags}`
                : result.content;

            const niche = db.getNicheByName(nicheName);
            const saved = db.savePost(niche.id, fullContent, 'tweet', 'draft');

            pendingPost = {
                id: saved.lastInsertRowid,
                content: fullContent,
                nicheName,
            };

            let preview = `📝 *Yeni Tweet Önizleme:*\n\n${fullContent}\n\n`;
            preview += `✅ /onayla — Paylaş | 🔄 /reddet — Başka bir tane`;

            bot.sendMessage(chatId, preview, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Hata: ${error.message}`);
        }
    });

    // /analiz <kullanıcıadı> — Profil analizi
    bot.onText(/\/analiz(?:\s+@?(.+))?/, async (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const username = match?.[1]?.trim().replace('@', '');

        if (!username) {
            bot.sendMessage(chatId, '❓ Kullanım: `/analiz twitterkullanici`', { parse_mode: 'Markdown' });
            return;
        }

        if (!isTwitterConfigured()) {
            bot.sendMessage(chatId, '❌ Profil analizi için Twitter API gerekli. .env dosyasına anahtarları ekleyin.');
            return;
        }

        bot.sendMessage(chatId, `🔍 @${username} profili analiz ediliyor...`);

        try {
            const analysis = await analyzeProfile(username);
            const text = formatAnalysisForTelegram(analysis);

            // Kullanıcı adını kaydet (içerik üretiminde kullanmak için)
            db.setSetting('twitter_username', username);

            bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Analiz hatası: ${error.message}`);
        }
    });

    // /zamanlama — Otomatik paylaşım
    bot.onText(/\/zamanlama(?:\s+(.+))?/, (msg, match) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;
        const param = match?.[1]?.trim();

        if (!param) {
            let text = `⏰ *Otomatik Paylaşım Ayarları*\n\n`;
            text += `Kullanım: \`/zamanlama <saat>\`\n\n`;
            text += `Örnekler:\n`;
            text += `\`/zamanlama 09:00\` — Her gün 09:00'da\n`;
            text += `\`/zamanlama 09:00,13:00,18:00\` — Günde 3 kez\n`;
            text += `\`/zamanlama kapat\` — Otomatik paylaşımı kapat\n\n`;
            text += `📅 Aktif görevler: ${getActiveJobCount()}`;

            bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            return;
        }

        if (param === 'kapat') {
            const { stopAll } = require('../scheduler/cron');
            stopAll();
            bot.sendMessage(chatId, '⏹ Tüm zamanlanmış görevler durduruldu.');
            return;
        }

        const niches = db.getAllNiches();
        if (niches.length === 0) {
            bot.sendMessage(chatId, '❌ Önce bir niş ekleyin.');
            return;
        }

        // Saatleri cron ifadesine çevir
        const times = param.split(',').map((t) => t.trim());
        let addedCount = 0;

        for (const time of times) {
            const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (!timeMatch) {
                bot.sendMessage(chatId, `❌ Geçersiz saat formatı: "${time}". Örnek: 09:00`);
                return;
            }

            const [, hour, minute] = timeMatch;
            const cronExpr = `${minute} ${hour} * * *`; // Her gün belirtilen saatte

            // İlk niş için zamanlama ekle
            addAndStartSchedule(niches[0].id, cronExpr, (text) => {
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            });
            addedCount++;
        }

        bot.sendMessage(
            chatId,
            `✅ ${addedCount} zamanlama eklendi!\n\nNiş: *${niches[0].name}*\nSaatler: ${times.join(', ')}\n\nHer gün belirtilen saatlerde otomatik içerik üretilip paylaşılacak.`,
            { parse_mode: 'Markdown' }
        );
    });

    // /durum — İstatistikler
    bot.onText(/\/durum/, async (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;

        const stats = db.getPostStats();
        const niches = db.getAllNiches();
        const provider = getActiveProvider();
        const twitterUser = await getMe();

        let text = `📊 *NicheBot İstatistikleri*\n\n`;

        text += `🧠 *LLM:* ${provider.name} (${provider.model})\n`;
        text += twitterUser
            ? `🐦 *Twitter:* @${twitterUser.username}\n`
            : `🐦 *Twitter:* Bağlı değil\n`;
        text += `📅 *Aktif Görevler:* ${getActiveJobCount()}\n\n`;

        text += `📝 *İçerik:*\n`;
        text += `  Toplam: ${stats.total || 0}\n`;
        text += `  Paylaşılan: ${stats.published || 0}\n`;
        text += `  Taslak: ${stats.drafts || 0}\n`;
        text += `  Bugün: ${stats.today || 0}/${config.maxDailyPosts}\n\n`;

        text += `🏷 *Nişler (${niches.length}):* ${niches.map((n) => n.name).join(', ') || 'Yok'}`;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });

    // /yardim — Detaylı yardım
    bot.onText(/\/yardim/, (msg) => {
        if (!isAuthorized(msg)) return;
        const chatId = msg.chat.id;

        const text = `📖 *NicheBot Yardım*

*Niş Yönetimi:*
\`/niche <konu>\` — Yeni niş ekle
\`/nisler\` — Aktif nişleri göster
\`/sil <konu>\` — Niş kaldır

*İçerik Üretimi:*
\`/uret\` — İlk niş için tweet üret
\`/uret <konu>\` — Belirli niş için üret
\`/thread <sayı>\` — Thread üret (varsayılan: 4)

*Paylaşım:*
\`/onayla\` — Önizlenen içeriği Twitter'da paylaş
\`/reddet\` — Yenisini üret

*Profil Analizi:*
\`/analiz <kullanıcıadı>\` — Twitter profilini analiz et

*Zamanlama:*
\`/zamanlama 09:00\` — Her gün 09:00'da paylaş
\`/zamanlama 09:00,18:00\` — Günde 2 kez
\`/zamanlama kapat\` — Otomatik paylaşımı durdur

*Genel:*
\`/durum\` — İstatistikler
\`/start\` — Başlangıç + durum`;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });

    // Düz metin mesajları — düzenleme olarak kullan
    bot.on('message', (msg) => {
        if (!isAuthorized(msg)) return;
        if (msg.text?.startsWith('/')) return; // Komutları atla

        if (pendingPost && msg.text) {
            // Kullanıcı düzenlenmiş metin gönderdi
            pendingPost.content = msg.text;
            const niche = db.getNicheByName(pendingPost.nicheName);
            if (niche) {
                db.savePost(niche.id, msg.text, 'tweet', 'draft');
            }

            bot.sendMessage(
                msg.chat.id,
                `✏️ İçerik güncellendi!\n\n${msg.text}\n\n✅ /onayla — Paylaş\n🔄 /reddet — Başka bir tane`,
                { parse_mode: 'Markdown' }
            );
        }
    });
}

/**
 * Yetki kontrolü
 */
function isAuthorized(msg) {
    if (!config.telegram.allowedUserId) return true;
    return msg.from.id === config.telegram.allowedUserId;
}

/**
 * Bildirim gönderme fonksiyonu (scheduler için)
 */
function getNotifyFunction(chatId) {
    return (text) => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

module.exports = { initBot, getNotifyFunction };
