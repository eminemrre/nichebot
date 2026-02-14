# 🤖 NicheBot — AI Sosyal Medya İçerik Asistanı

Açık kaynak, PicoClaw tarzı hafif bir Telegram botu. Twitter/X profilinizi analiz eder, niş konularda AI destekli kaliteli içerik üretir ve zamanlanmış olarak paylaşır.

**Tüm API anahtarlarını siz sağlarsınız — bize hiçbir maliyet yok.**

## ✨ Özellikler

- 🧠 **Çoklu LLM Desteği** — OpenAI, Anthropic Claude, DeepSeek
- 📊 **Profil Analizi** — Twitter profilinizi analiz edip kişiye özel öneriler
- 🏷 **Niş Yönetimi** — Birden fazla konu alanı ekleyin
- 📝 **Akıllı İçerik Üretimi** — Tweet ve thread üretimi, tekrar önleme
- 👀 **Önizle → Onayla Akışı** — İçeriği Telegram'da görün, düzenleyin, onaylayın
- ⏰ **Zamanlanmış Paylaşım** — İstediğiniz saatte otomatik paylaşım
- 🐦 **Twitter/X Entegrasyonu** — Tek tweet ve thread paylaşımı
- 🔒 **Güvenli** — API anahtarları sadece local dosyada, kullanıcı yetkilendirme

## 📋 Gereksinimler

- Node.js 18+
- Telegram Bot Token (@BotFather'dan)
- LLM API Key (birini seçin: OpenAI / Anthropic / DeepSeek)
- Twitter/X API Keys (opsiyonel — paylaşım için)

## 🚀 Kurulum

```bash
# 1. Repoyu klonlayın
git clone https://github.com/eminemre35/nichebot.git
cd nichebot

# 2. Bağımlılıkları yükleyin
npm install

# 3. .env dosyasını oluşturun
cp .env.example .env

# 4. .env dosyasını düzenleyin — API anahtarlarınızı girin
nano .env

# 5. Botu başlatın
npm start
```

## ⚙️ Yapılandırma

`.env` dosyasını düzenleyin:

```env
# Telegram (ZORUNLU)
TELEGRAM_BOT_TOKEN=bot_tokeniniz
TELEGRAM_ALLOWED_USER_ID=telegram_id_niz

# LLM (ZORUNLU - birini seçin)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Twitter/X (OPSİYONEL)
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
```

## 📱 Telegram Komutları

| Komut | İşlev |
|-------|-------|
| `/start` | Hoş geldin + bağlantı durumu |
| `/niche <konu>` | Niş konu ekle |
| `/nisler` | Aktif nişleri listele |
| `/sil <konu>` | Niş kaldır |
| `/uret` | Tweet üret + önizle |
| `/thread <sayı>` | Thread üret |
| `/onayla` | İçeriği Twitter'da paylaş |
| `/reddet` | Yenisini üret |
| `/analiz <kullanıcı>` | Twitter profil analizi |
| `/zamanlama <saat>` | Otomatik paylaşım ayarla |
| `/durum` | İstatistikler |

## 🏗 Mimari

```
Telegram → Bot (Komutlar) → LLM Provider (OpenAI/Anthropic/DeepSeek)
                ↕                        ↓
         SQLite (Hafıza)          İçerik Üretimi
                                        ↓
                                Twitter API (Paylaşım)
```

## 🖥 VDS'de Çalıştırma (PM2 ile)

```bash
# PM2 yükleyin
npm install -g pm2

# Botu PM2 ile başlatın
pm2 start src/index.js --name nichebot

# Otomatik yeniden başlatma
pm2 startup
pm2 save
```

## 📄 Lisans

MIT License — Özgürce kullanın, değiştirin, dağıtın.
