const OpenAI = require('openai');
const { config } = require('../config');

/**
 * LLM Provider Factory — Kullanıcının seçtiği sağlayıcıyı döndürür
 * OpenAI, Anthropic ve DeepSeek hepsi OpenAI-uyumlu SDK ile çalışır
 */
function createLLMClient() {
    const provider = config.llm.provider;

    switch (provider) {
        case 'openai':
            return new OpenAI({ apiKey: config.llm.openai.apiKey });

        case 'anthropic':
            // Anthropic'in kendi messages API'sini kullanıyoruz
            return new OpenAI({
                apiKey: config.llm.anthropic.apiKey,
                baseURL: 'https://api.anthropic.com/v1/',
                defaultHeaders: {
                    'anthropic-version': '2023-06-01',
                },
            });

        case 'deepseek':
            return new OpenAI({
                apiKey: config.llm.deepseek.apiKey,
                baseURL: 'https://api.deepseek.com',
            });

        default:
            throw new Error(`Bilinmeyen LLM sağlayıcı: ${provider}`);
    }
}

/**
 * Aktif modeli döndür
 */
function getModel() {
    const provider = config.llm.provider;
    return config.llm[provider]?.model || 'gpt-4o-mini';
}

/**
 * LLM'e mesaj gönder ve yanıt al
 * @param {string} systemPrompt - Sistem prompt
 * @param {string} userMessage - Kullanıcı mesajı
 * @returns {Promise<string>} LLM yanıtı
 */
async function chat(systemPrompt, userMessage) {
    const client = createLLMClient();
    const model = getModel();
    const provider = config.llm.provider;

    try {
        // Anthropic özel endpoint kullanıyor
        if (provider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.llm.anthropic.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }],
                }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.content[0].text;
        }

        // OpenAI ve DeepSeek — aynı SDK
        const completion = await client.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 1024,
            temperature: 0.8,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error(`LLM hatası (${provider}):`, error.message);
        throw new Error(`LLM yanıt veremedi: ${error.message}`);
    }
}

module.exports = { chat, getModel, createLLMClient };
