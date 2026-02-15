const DEFAULT_PROMPT_TEMPLATE_VERSION = 'v1';

function toLanguageLabel(language) {
    return String(language || 'tr').toLowerCase() === 'en' ? 'English' : 'Türkçe';
}

function buildTweetV1SystemPrompt(context) {
    const {
        nicheName,
        tone,
        language,
        profileContext,
        recentTexts,
    } = context;

    return `Sen profesyonel bir sosyal medya içerik üreticisisin.
Görevin: "${nicheName}" konusunda Twitter/X için etkileyici, özgün içerikler üretmek.

KURALLAR:
- Dil: ${toLanguageLabel(language)}
- Ton: ${tone}
- Maksimum 270 karakter (hashtag'ler hariç)
- Doğal, samimi, insan gibi yaz — robot gibi olma
- Emoji kullan ama abartma (1-2 tane yeterli)
- İlgi çekici, paylaşılabilir olsun
- Soru sorarak veya görüş belirterek etkileşim artır
- 2-4 alakalı hashtag öner
- Kesin kazanç/garanti vaadi, spam çağrısı ve zararlı-yasadışı yönlendirme kullanma

${profileContext ? `KULLANICININ PROFİL ANALİZİ:\n${profileContext}\nBu profile uygun bir tonda ve konuda yaz.` : ''}

${recentTexts ? `SON PAYLAŞIMLAR (bunlardan farklı bir şey üret):\n${recentTexts}` : ''}

CEVAP FORMATI (tam olarak bu formatta yanıt ver):
TWEET: [tweet metni]
HASHTAGS: [#hashtag1 #hashtag2 #hashtag3]`;
}

function buildTweetV1UserPrompt(context) {
    const { nicheName, tone } = context;
    return `"${nicheName}" konusunda yeni bir tweet üret. ${tone} tonda olsun.`;
}

function buildThreadV1SystemPrompt(context) {
    const { nicheName, tweetCount, tone, language } = context;

    return `Sen profesyonel bir sosyal medya içerik üreticisisin.
Görevin: "${nicheName}" konusunda ${tweetCount} tweet'lik bir Twitter thread (konu dizisi) oluşturmak.

KURALLAR:
- Dil: ${toLanguageLabel(language)}
- Ton: ${tone}
- Her tweet maksimum 270 karakter
- İlk tweet dikkat çekici bir giriş olsun
- Son tweet bir özet veya call-to-action olsun
- Her tweet numaralanmış olsun (1/, 2/, ...)
- Hashtag'ler sadece son tweet'te olsun
- Kesin kazanç/garanti vaadi, spam çağrısı ve zararlı-yasadışı yönlendirme kullanma

CEVAP FORMATI:
THREAD:
1/ [ilk tweet]
2/ [ikinci tweet]
...
HASHTAGS: [#hashtag1 #hashtag2]`;
}

function buildThreadV1UserPrompt(context) {
    const { nicheName, tweetCount } = context;
    return `"${nicheName}" konusunda ${tweetCount} tweet'lik detaylı bir thread oluştur.`;
}

const PROMPT_TEMPLATE_REGISTRY = {
    tweet: {
        v1: {
            version: 'tweet-v1',
            buildSystemPrompt: buildTweetV1SystemPrompt,
            buildUserPrompt: buildTweetV1UserPrompt,
        },
    },
    thread: {
        v1: {
            version: 'thread-v1',
            buildSystemPrompt: buildThreadV1SystemPrompt,
            buildUserPrompt: buildThreadV1UserPrompt,
        },
    },
};

function getPromptTemplate(type, requestedVersion = DEFAULT_PROMPT_TEMPLATE_VERSION) {
    const normalizedType = String(type || '').trim().toLowerCase();
    const normalizedVersion = String(requestedVersion || DEFAULT_PROMPT_TEMPLATE_VERSION)
        .trim()
        .toLowerCase();

    const templates = PROMPT_TEMPLATE_REGISTRY[normalizedType];
    if (!templates) {
        throw new Error(`Bilinmeyen prompt şablon tipi: ${type}`);
    }

    const fallbackVersion = DEFAULT_PROMPT_TEMPLATE_VERSION;
    const supportedVersions = Object.keys(templates);
    const template = templates[normalizedVersion] || templates[fallbackVersion];

    if (!template) {
        throw new Error(`Prompt şablonu bulunamadı: ${normalizedType}/${normalizedVersion}`);
    }

    return {
        type: normalizedType,
        requestedVersion: normalizedVersion,
        resolvedVersion: template.version,
        fallbackUsed: !templates[normalizedVersion],
        supportedVersions,
        buildSystemPrompt: template.buildSystemPrompt,
        buildUserPrompt: template.buildUserPrompt,
    };
}

module.exports = {
    DEFAULT_PROMPT_TEMPLATE_VERSION,
    getPromptTemplate,
};
