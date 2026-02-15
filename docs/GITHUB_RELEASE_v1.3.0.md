# NicheBot v1.3.0

NicheBot v1.3.0 ile proje artık sadece çalışan bir bot değil, operasyonel olarak sürdürülebilir bir terminal ürünü seviyesine çıkıyor.

## Öne Çıkanlar

- Prompt kalite sistemi: template versioning + skor + red-flag kontrolü
- Güvenlik hattı: secret scan, npm audit gate, CodeQL, Dependabot
- Operasyon komutları: stop, backup/restore, backup verify/prune, db doctor/optimize
- Release otomasyonu: tag ile çalışan GitHub Release pipeline ve changelog tabanlı not üretimi

## Neden önemli?

- Bot çıktılarının kalitesi ölçülebilir hale geldi
- Tek süreç kilidi ve veri yedekleme ile runtime riski ciddi biçimde azaldı
- Üretimde veri bütünlüğü ve veritabanı sağlığı CLI üzerinden yönetilebilir oldu
- Sürüm çıkarmak manuel adımlardan otomatik, izlenebilir bir akışa taşındı

## Hızlı Başlangıç

```bash
npm install
npm link
nichebot setup
nichebot doctor
nichebot start
```

## Önerilen üretim kontrolü

```bash
npm run quality:full
npm run security:full
npm run release:check
```

Geri bildirim ve katkı için issue/PR açabilirsiniz: https://github.com/eminemrre/nichebot
