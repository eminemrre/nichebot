# NicheBot v1.2.0

NicheBot artık production kullanımına uygun, terminal-first bir bot deneyimi sunuyor.  
Bu sürümde odak: **güvenli kurulum**, **deterministik kalite kapıları**, **release/ops olgunluğu**.

## Öne Çıkanlar

- `nichebot setup`, `nichebot doctor`, `nichebot start` ile net CLI akışı
- Runtime izolasyonu: varsayılan `~/.nichebot` (opsiyonel `NICHEBOT_HOME`)
- Legacy `.env` ve SQLite verisi için güvenli migration
- Telegram mesajlarında Markdown parse hatasına karşı fallback (plain text retry)
- CI pipeline (Node 18/20), test suite ve kalite komutları

## Üretim (Production) İyileştirmeleri

- Sıkı doğrulama: kritik alanlar eksikse startup fail-fast
- `TELEGRAM_ALLOWED_USER_ID` zorunlu tek-kullanıcı güvenlik modeli
- `npm run quality` ile tek komutta lint + test
- Production runbook ve ops checklist dokümantasyonu
- Güvenlik/katkı yönetimi: `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR template’leri

## Paketleme ve Dağıtım

- npm paketi sadeleştirildi (`files` whitelist)
- Paket içeriği küçültüldü, dağıtım yüzeyi daraltıldı

## Breaking / Contract Değişiklikleri

- `TELEGRAM_ALLOWED_USER_ID` artık zorunlu.
- Runtime config varsayılanı repo kökünden `~/.nichebot/.env` konumuna taşındı.

## Upgrade Notları (v1.1.x -> v1.2.0)

1. `nichebot doctor` çalıştırın.
2. Gerekirse `nichebot setup` ile yeni runtime config oluşturun.
3. Eski repo içi `.env`/DB varsa ilk `nichebot start` migration yapacaktır.
4. `nichebot doctor --json` ile `valid=true` doğrulayın.

## Quality Snapshot

- Lint: passing
- Test: passing (10/10)
- CI workflow: enabled (`main` + PR)

## Teşekkür

Projeyi production seviyesine taşımaya katkı veren herkese teşekkürler.  
Yeni özellik/feedback için issue açabilirsiniz:  
https://github.com/eminemrre/nichebot/issues
