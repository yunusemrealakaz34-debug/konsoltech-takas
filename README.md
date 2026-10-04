# 🎮 KonsolTech Takas — Bağımsız Oyun Takas Sitesi

PS4 · PS5 · Nintendo Switch oyunları için takas/satış fiyat listesi.
PS4, PS5, Switch ve Switch 2 için canlı arama, kondisyon ayrımı ve stok bağlantısı.

**Canlı:** https://takas.konsoltech.tr · Ana site: https://konsoltech.tr

## Yapı
| Dosya | Görev |
|-------|-------|
| `index.html` | Ana sayfa — arama + kategoriler + oyun kartları |
| `app.js` | Arama / filtre / render |
| `styles.css` | Tasarım |
| `data/games.json` | Derlenmiş katalog ve onaylı ikinci el fiyatları |
| `data/sources/*.csv` | Orijinal fiyat listeleri |
| `data/sources/stok-ekleri.json` | TM'de doğrulanmış ek oyun/sürümler; fiyat canlı stoktan gelir |
| `scripts/` | Veri derleme + kapak + yeni-oyun tarama |
| `.github/workflows/` | Haftalık derleme ve rakip fiyat/eksik oyun denetimi |

## Fiyat güncelleme
1. `data/sources/*.csv` düzenle → 2. `python3 scripts/build_data.py`

Stoklu ürünün fiyatı, aynı kondisyonun TM satış fiyatıdır. Sıfır ve ikinci el
birbirinin fiyatını ezmez. Rakip fiyatları otomatik uygulanmaz. Mevcut satışa
eşit/yüksek takas teklifi sayısal tutar yerine **Sor** gösterir.

`updatedAt` yalnız katalog/fiyat değişince ilerler; haftalık çalışmanın tarihi değildir.
Kaynak CSV'deki numarasız “Naruto Shippuden Ultimate Ninja Strom” teklifi, sürümü
doğrulanana kadar yayınlanmaz; Storm 4 fiyatı olarak tahmin edilmez.

## Fiyat ve eksik oyun denetimi

`python3 scripts/check_prices.py` dört Oyunmerkezi listesini ve TM stok fiyatlarını
tek çalışmada okur. Sonuçlar `data/fiyat-denetim.json`, `data/fiyat-uyari.txt` ve
`data/yeni-oyunlar.txt` dosyalarındadır. Eksikler adaydır; fiziksel sürüm ve çıkış
kontrolü gerekir. Rakibin fiyat listesi stok/kondisyon teyidi sayılmaz.

Kaynak hatasında işlem başarısız olur, son tam rapor korunur. Ayrıntı
`data/fiyat-denetim-hata.json` dosyasına yazılır. Tekrarlanabilir denetim için
`--snapshot-dir` ile `ps4.html`, `ps5.html`, `switch1.html`, `switch2.html`,
`stock.json` bulunan bir klasör verilebilir.

TM katalog önbelleği bir saate kadar eski listeyi tutabilir. Yeni katalog kimlikleri
stok yayınına önbellek yenilenince yansır; stok miktarları bu derleyiciyle değişmez.

## Kapak ekleme
- Anahtarsız: `python3 scripts/enrich_images_steam.py`
- Tam kapsama: `export RAWG_KEY=... && python3 scripts/enrich_images.py`

## Yerel test
`python3 -m unittest discover -s tests -p 'test_*.py'`

`node --test tests/frontend.test.cjs`

`python3 -m http.server 8000` → http://localhost:8000
