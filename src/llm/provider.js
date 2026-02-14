const OpenAI = require('openai');
const { config } = require('../config');
const { retry } = require('../utils/helpers');
const logger = require('../utils/logger');

let client = null;

/**
 * LLM client'ı oluştur (lazy singleton)
 */
function getClient() {
    if (client) return client;

    const provider = config.llm.provider;

    switch (provider) {
        case 'openai':
            client = new OpenAI({ apiKey: config.llm.openai.apiKey });
            break;

        case 'deepseek':
            client = new OpenAI({
                apiKey: config.llm.deepseek.apiKey,
                baseURL: 'https://api.deepseek.com',
            });
            break;

        case 'anthropic':
            // Anthropic kendi API'sini kullanır, client null kalır
            client = null;
            break;

        default:
            throw new Error(`Bilinmeyen LLM sağlayıcı: ${provider}`);
    }

    return client;
}

/**
 * Aktif modeli döndür
 */
function getModel() {
    const provider = config.llm.provider;
    return config.llm[provider]?.model || 'gpt-4o-mini';
}

/**
 * LLM'e mesaj gönder ve yanıt al (retry ile)
 * @param {string} systemPrompt - Sistem prompt
 * @param {string} userMessage - Kullanıcı mesajı
 * @returns {Promise<string>} LLM yanıtı
 */
async function chat(systemPrompt, userMessage) {
    const provider = config.llm.provider;
    const model = getModel();

    return retry(
        async () => {
            if (provider === 'anthropic') {
                return await callAnthropic(systemPrompt, userMessage, model);
            }
            return await callOpenAICompatible(systemPrompt, userMessage, model);
        },
        {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (err, attempt, delay) => {
                logger.warn(`LLM retry ${attempt}/3 (${delay}ms): ${err.message}`);
            },
        }
    );
}

/**
 * Anthropic Messages API (fetch tabanlı)
 */
async function callAnthropic(systemPrompt, userMessage, model) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.llm.anthropic.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || 'Anthropic API error');
    }

    return data.content[0].text;
}

/**
 * OpenAI-uyumlu API (OpenAI, DeepSeek)
 */
async function callOpenAICompatible(systemPrompt, userMessage, model) {
    const openaiClient = getClient();

    const completion = await openaiClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.8,
    });

    return completion.choices[0].message.content;
}

module.exports = { chat, getModel };
