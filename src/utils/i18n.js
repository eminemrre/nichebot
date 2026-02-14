const path = require('path');
const fs = require('fs');

const locales = {};
let currentLang = 'tr';

/**
 * i18n başlat
 * @param {string} lang - Dil kodu (tr/en)
 */
function init(lang = 'tr') {
    currentLang = lang;
    loadLocale('tr');
    loadLocale('en');
}

function loadLocale(lang) {
    const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    if (fs.existsSync(filePath)) {
        locales[lang] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
}

/**
 * Çeviri getir
 * @param {string} key - Noktalı anahtar (örn: "bot.welcome")
 * @param {object} params - Değişkenler (örn: { name: "test" })
 * @returns {string}
 */
function t(key, params = {}) {
    const keys = key.split('.');
    let value = locales[currentLang];

    for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
    }

    // Fallback to English
    if (value === undefined) {
        value = locales['en'];
        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) break;
        }
    }

    // Key bulunamadı
    if (value === undefined) return key;

    // Parametreleri yerleştir
    let result = String(value);
    for (const [param, val] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), String(val));
    }

    return result;
}

/**
 * Aktif dili değiştir
 */
function setLanguage(lang) {
    if (locales[lang]) {
        currentLang = lang;
        return true;
    }
    return false;
}

/**
 * Aktif dil
 */
function getLanguage() {
    return currentLang;
}

module.exports = { init, t, setLanguage, getLanguage };
