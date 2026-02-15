const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const LETTER_REGEX = /[A-Za-zÇĞİÖŞÜçğıöşü]/g;
const UPPERCASE_REGEX = /[A-ZÇĞİÖŞÜ]/g;
const HASHTAG_REGEX = /(^|\s)(#[\p{L}\p{N}_-]{2,50})/gu;

const RED_FLAG_RULES = [
    {
        code: 'GUARANTEED_RESULT_CLAIM',
        severity: 'high',
        message: 'Kesin/garantili sonuç vaadi tespit edildi.',
        pattern: /(100%|%100|garanti(?:li)?|kesin).{0,30}(kazan[cç]|kazanç|getiri|profit|sonu[cç]|başarı)/i,
    },
    {
        code: 'SPAMMY_CTA',
        severity: 'medium',
        message: 'Spam-benzeri çağrı ifadesi tespit edildi.',
        pattern: /\b(click here|hemen t[ıi]kla|dm me|bana dm|free money|bedava para)\b/i,
    },
    {
        code: 'PROMPT_INJECTION_HINT',
        severity: 'medium',
        message: 'Prompt enjeksiyonuna benzeyen ifade tespit edildi.',
        pattern: /\b(ignore (all|previous) instructions|system prompt|talimatlar[ıi] yok say|önceki talimatlar[ıi] unut)\b/i,
    },
    {
        code: 'HARMFUL_ILLEGAL_GUIDANCE',
        severity: 'high',
        message: 'Zararlı/yasadışı yönlendirme ifadesi tespit edildi.',
        pattern: /\b(phishing|hesap [çc]alma|kart kopyalama|malware dağıt|yasadışı y[öo]ntem)\b/i,
    },
];

const RED_FLAG_PENALTY = {
    high: 35,
    medium: 16,
    low: 8,
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

function extractHashtags(text) {
    const input = String(text || '');
    const matches = [];
    for (const match of input.matchAll(HASHTAG_REGEX)) {
        if (match[2]) matches.push(match[2].toLowerCase());
    }
    return [...new Set(matches)];
}

function countMatches(text, regex) {
    const input = String(text || '');
    const matches = input.match(regex);
    return matches ? matches.length : 0;
}

function getUppercaseRatio(text) {
    const input = String(text || '');
    const letters = input.match(LETTER_REGEX) || [];
    if (letters.length === 0) return 0;
    const upper = input.match(UPPERCASE_REGEX) || [];
    return Number((upper.length / letters.length).toFixed(3));
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3);
}

function maxSimilarityScore(content, recentContents = []) {
    const currentTokens = new Set(tokenize(content));
    if (currentTokens.size === 0) return 0;

    let maxSimilarity = 0;
    for (const previous of recentContents) {
        const previousTokens = new Set(tokenize(previous));
        if (previousTokens.size === 0) continue;

        let intersection = 0;
        for (const token of currentTokens) {
            if (previousTokens.has(token)) intersection += 1;
        }

        const union = currentTokens.size + previousTokens.size - intersection;
        if (union === 0) continue;

        const similarity = intersection / union;
        if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
        }
    }

    return Number(maxSimilarity.toFixed(3));
}

function detectRedFlags(text) {
    const input = String(text || '');
    return RED_FLAG_RULES.map((rule) => {
        const match = input.match(rule.pattern);
        if (!match) return null;
        return {
            code: rule.code,
            severity: rule.severity,
            message: rule.message,
            match: match[0],
        };
    }).filter(Boolean);
}

function applyCheck(scoreRef, checks, check) {
    const { code, passed, penalty = 0, detail } = check;
    const normalizedPenalty = passed ? 0 : Math.max(0, Number(penalty) || 0);
    checks.push({
        code,
        passed,
        penalty: normalizedPenalty,
        detail,
    });
    scoreRef.value = clamp(scoreRef.value - normalizedPenalty, 0, 100);
}

function resolveAction(score, redFlags) {
    const hasHighRiskFlag = redFlags.some((flag) => flag.severity === 'high');
    if (hasHighRiskFlag) return 'block';
    if (redFlags.length > 0) return 'warn';
    if (score < 70) return 'warn';
    return 'allow';
}

function summarizeCommonSignals(content, hashtags, recentContents = []) {
    const hashtagList = extractHashtags(`${content}\n${hashtags}`);
    const emojiCount = countMatches(content, EMOJI_REGEX);
    const uppercaseRatio = getUppercaseRatio(content);
    const repeatedPunctuation = /([!?.,])\1{2,}/.test(content);
    const similarity = maxSimilarityScore(content, recentContents);

    return {
        hashtagList,
        hashtagCount: hashtagList.length,
        emojiCount,
        uppercaseRatio,
        repeatedPunctuation,
        similarity,
    };
}

function evaluateTweetQuality(input = {}) {
    const content = String(input.content || '').trim();
    const hashtags = String(input.hashtags || '').trim();
    const recentContents = Array.isArray(input.recentContents) ? input.recentContents : [];
    const checks = [];
    const scoreRef = { value: 100 };

    const signals = summarizeCommonSignals(content, hashtags, recentContents);
    const contentLength = content.length;

    applyCheck(scoreRef, checks, {
        code: 'TWEET_LENGTH',
        passed: contentLength <= 270,
        penalty: 24,
        detail: `Tweet metni ${contentLength} karakter (limit 270).`,
    });

    applyCheck(scoreRef, checks, {
        code: 'HASHTAG_COUNT',
        passed: signals.hashtagCount >= 2 && signals.hashtagCount <= 4,
        penalty: 12,
        detail: `Hashtag sayısı ${signals.hashtagCount} (önerilen 2-4).`,
    });

    applyCheck(scoreRef, checks, {
        code: 'EMOJI_DENSITY',
        passed: signals.emojiCount <= 3,
        penalty: 8,
        detail: `Emoji sayısı ${signals.emojiCount} (önerilen <=3).`,
    });

    applyCheck(scoreRef, checks, {
        code: 'UPPERCASE_RATIO',
        passed: signals.uppercaseRatio <= 0.35,
        penalty: 10,
        detail: `Büyük harf oranı ${signals.uppercaseRatio}.`,
    });

    applyCheck(scoreRef, checks, {
        code: 'PUNCTUATION_NOISE',
        passed: !signals.repeatedPunctuation,
        penalty: 8,
        detail: signals.repeatedPunctuation
            ? 'Tekrarlı noktalama tespit edildi (ör. !!! veya ???).'
            : 'Tekrarlı noktalama yok.',
    });

    applyCheck(scoreRef, checks, {
        code: 'RECENT_DUPLICATION',
        passed: signals.similarity < 0.72,
        penalty: 20,
        detail: `Son paylaşımlarla benzerlik skoru ${signals.similarity}.`,
    });

    const redFlags = detectRedFlags(`${content}\n${hashtags}`);
    redFlags.forEach((flag) => {
        const penalty = RED_FLAG_PENALTY[flag.severity] || 0;
        applyCheck(scoreRef, checks, {
            code: `RED_FLAG_${flag.code}`,
            passed: false,
            penalty,
            detail: `${flag.message} (${flag.match})`,
        });
    });

    const score = clamp(Math.round(scoreRef.value), 0, 100);

    return {
        score,
        grade: toGrade(score),
        action: resolveAction(score, redFlags),
        checks,
        redFlags,
        summary: {
            contentLength,
            hashtagCount: signals.hashtagCount,
            emojiCount: signals.emojiCount,
            uppercaseRatio: signals.uppercaseRatio,
            duplicationSimilarity: signals.similarity,
        },
    };
}

function evaluateThreadQuality(input = {}) {
    const tweets = Array.isArray(input.tweets) ? input.tweets.map((tweet) => String(tweet || '').trim()) : [];
    const hashtags = String(input.hashtags || '').trim();
    const recentContents = Array.isArray(input.recentContents) ? input.recentContents : [];
    const checks = [];
    const scoreRef = { value: 100 };

    const joinedContent = tweets.join('\n');
    const signals = summarizeCommonSignals(joinedContent, hashtags, recentContents);

    const overLimitCount = tweets.filter((tweet) => tweet.length > 270).length;
    applyCheck(scoreRef, checks, {
        code: 'THREAD_TWEET_COUNT',
        passed: tweets.length >= 2 && tweets.length <= 10,
        penalty: 18,
        detail: `Thread tweet sayısı ${tweets.length} (önerilen 2-10).`,
    });

    applyCheck(scoreRef, checks, {
        code: 'THREAD_TWEET_LENGTH',
        passed: overLimitCount === 0,
        penalty: clamp(overLimitCount * 10, 0, 30),
        detail: `Limit aşan tweet sayısı ${overLimitCount}.`,
    });

    const hasHook = tweets[0] ? /[!?]/.test(tweets[0]) || tweets[0].length >= 70 : false;
    applyCheck(scoreRef, checks, {
        code: 'THREAD_OPENING_HOOK',
        passed: hasHook,
        penalty: 8,
        detail: hasHook ? 'İlk tweet giriş etkisi yeterli görünüyor.' : 'İlk tweet daha güçlü bir giriş içermeli.',
    });

    applyCheck(scoreRef, checks, {
        code: 'HASHTAG_COUNT',
        passed: signals.hashtagCount >= 1 && signals.hashtagCount <= 4,
        penalty: 10,
        detail: `Hashtag sayısı ${signals.hashtagCount} (önerilen 1-4).`,
    });

    applyCheck(scoreRef, checks, {
        code: 'RECENT_DUPLICATION',
        passed: signals.similarity < 0.72,
        penalty: 20,
        detail: `Son paylaşımlarla benzerlik skoru ${signals.similarity}.`,
    });

    const redFlags = detectRedFlags(`${joinedContent}\n${hashtags}`);
    redFlags.forEach((flag) => {
        const penalty = RED_FLAG_PENALTY[flag.severity] || 0;
        applyCheck(scoreRef, checks, {
            code: `RED_FLAG_${flag.code}`,
            passed: false,
            penalty,
            detail: `${flag.message} (${flag.match})`,
        });
    });

    const score = clamp(Math.round(scoreRef.value), 0, 100);

    return {
        score,
        grade: toGrade(score),
        action: resolveAction(score, redFlags),
        checks,
        redFlags,
        summary: {
            tweetCount: tweets.length,
            overLimitCount,
            hashtagCount: signals.hashtagCount,
            duplicationSimilarity: signals.similarity,
        },
    };
}

function summarizeRedFlags(redFlags = [], maxItems = 3) {
    if (!Array.isArray(redFlags) || redFlags.length === 0) return 'none';
    return redFlags
        .slice(0, maxItems)
        .map((flag) => `${flag.code}:${flag.severity}`)
        .join(', ');
}

module.exports = {
    evaluateTweetQuality,
    evaluateThreadQuality,
    summarizeRedFlags,
};
