# 🎮 KonsolTech Takas — Bağımsız Oyun Takas Sitesi

PS4 · PS5 · Nintendo Switch oyunları için takas/satış fiyat listesi.
888+ oyun, canlı arama, oyun kapakları, haftalık otomatik güncelleme.

**Canlı:** https://takas.konsoltech.tr (kurulunca) · Ana site: https://konsoltech.tr

## Yapı
| Dosya | Görev |
|-------|-------|
| `index.html` | Ana sayfa — arama + kategoriler + oyun kartları |
| `app.js` | Arama / filtre / render |
| `styles.css` | Tasarım |
| `data/games.json` | Tek veri kaynağı (888 oyun) |
| `data/sources/*.csv` | Orijinal fiyat listeleri |
| `scripts/` | Veri derleme + kapak + yeni-oyun tarama |
| `.github/workflows/` | Haftalık otomatik güncelleme |

## Fiyat güncelleme
1. `data/sources/*.csv` düzenle → 2. `python3 scripts/build_data.py`

## Kapak ekleme
- Anahtarsız: `python3 scripts/enrich_images_steam.py`
- Tam kapsama: `export RAWG_KEY=... && python3 scripts/enrich_images.py`

## Yerel test
`python3 -m http.server 8000` → http://localhost:8000
