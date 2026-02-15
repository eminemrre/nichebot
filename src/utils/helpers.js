/**
 * Retry wrapper — exponential backoff ile yeniden deneme
 * @param {Function} fn - Çalıştırılacak async fonksiyon
 * @param {object} options
 * @returns {Promise<any>}
 */
async function retry(fn, options = {}) {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, onRetry = null } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) break;

            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

            if (onRetry) {
                onRetry(error, attempt, delay);
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Telegram Markdown özel karakterlerini escape et
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*[\]()`\\])/g, '\\$1');
}

/**
 * Markdown parse hatasında düz metin fallback için biçim karakterlerini temizle
 */
function stripMarkdownFormatting(text) {
    if (!text) return '';
    return String(text)
        .replace(/\\([_*[\]()`\\])/g, '$1')
        .replace(/[*_[\]()`]/g, '');
}

/**
 * Input sanitizasyonu — zararlı karakterleri temizle
 */
function sanitizeInput(input, maxLength = 100) {
    if (!input || typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, maxLength)
        .replace(/[<>{}]/g, ''); // HTML/injection temizliği
}

/**
 * Basit rate limiter
 */
class RateLimiter {
    constructor(cooldownMs = 3000) {
        this.cooldownMs = cooldownMs;
        this.lastAction = new Map();
    }

    /**
     * İşleme izin var mı kontrol et
     * @param {string} key - Benzersiz anahtar (userId + command)
     * @returns {boolean}
     */
    canProceed(key) {
        const now = Date.now();
        const last = this.lastAction.get(key) || 0;

        if (now - last < this.cooldownMs) {
            return false;
        }

        this.lastAction.set(key, now);
        return true;
    }

    /**
     * Kalan bekleme süresi (ms)
     */
    getRemainingMs(key) {
        const now = Date.now();
        const last = this.lastAction.get(key) || 0;
        const remaining = this.cooldownMs - (now - last);
        return Math.max(0, remaining);
    }
}

module.exports = { retry, escapeMarkdown, stripMarkdownFormatting, sanitizeInput, RateLimiter };
