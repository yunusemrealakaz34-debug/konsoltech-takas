#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Oyun Takas Verisi Derleyici
=========================================
data/sources/ klasöründeki 4 CSV'yi tek bir temiz JSON'a (data/games.json) çevirir.

CSV yapıları:
  - ps4.csv     : 4 sütun, YAN YANA İKİ LİSTE
                  (Satis Adı;Satis Fiyati;Takas Adı;Takas Degeri)
                  → isimden eşleştirilip birleştirilir.
  - ps5/switch* : tek liste (Oyun Adı;Satış;Alış;Takas Farkı)

Çıktı modeli (her oyun):
  {
    "id": "ps5-elden-ring",
    "name": "Elden Ring",
    "platform": "ps5",
    "sell": 1299,        # site satış (müşteri öder) — yoksa null
    "buy": 700,          # site alış / takas değeri (mağaza öder) — yoksa null
    "image": null        # RAWG ile sonradan doldurulur
  }

Çalıştır:  python3 scripts/build_data.py
"""
import csv
import json
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from catalog_common import identity, money
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources"
OUT = ROOT / "data" / "games.json"

PLATFORM_LABELS = {
    "ps4": "PlayStation 4",
    "ps5": "PlayStation 5",
    "switch1": "Nintendo Switch",
    "switch2": "Nintendo Switch 2",
}

# Kaynakta oyun numarası eksik. Storm 4'e veya başka sürüme fiyat taşınmaz.
UNRESOLVED_BUY_TITLES = {identity("Naruto Shippuden Ultimate Ninja Strom")}


def to_int(val):
    """'1.299 TL' / '+1000' / '' → int|None"""
    return money(val)


def norm(name):
    """Eşleştirme için ad normalizasyonu (Türkçe + typo toleransı)."""
    if not name:
        return ""
    s = name.strip().lower()
    tr = {"ı": "i", "İ": "i", "ş": "s", "ğ": "g", "ü": "u",
          "ö": "o", "ç": "c", "â": "a", "î": "i", "’": "'"}
    for k, v in tr.items():
        s = s.replace(k, v)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(name))).strip("-")


def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f, delimiter=";"))


def parse_dual(path, platform):
    """PS4 tipi yan yana iki liste → birleştirilmiş kayıtlar."""
    rows = read_rows(path)[1:]  # başlık atla
    sell_map = {}   # norm -> (display_name, price)
    buy_map = {}
    for r in rows:
        r = (r + ["", "", "", ""])[:4]
        sname, sprice, bname, bprice = r[0], r[1], r[2], r[3]
        if sname.strip():
            sell_map[identity(sname)] = (sname.strip(), to_int(sprice))
        if bname.strip():
            buy_map[identity(bname)] = (bname.strip(), to_int(bprice))

    games = {}  # norm -> record

    # önce satış listesi
    for nkey, (disp, price) in sell_map.items():
        games[nkey] = {"name": disp, "sell": price, "buy": None}

    # Yalnız kesin kimlik / açık yazım alias'ı: devam oyunu tahmin edilmez.
    for nkey, (disp, price) in buy_map.items():
        if nkey in UNRESOLVED_BUY_TITLES:
            print(f"⚠ Sürümü doğrulanana kadar takas teklifi yayınlanmıyor: {disp}")
            continue
        match = nkey if nkey in games else None
        if match:
            games[match]["buy"] = price
        else:
            games[nkey] = {"name": disp, "sell": None, "buy": price}

    return finalize(games, platform)


def parse_single(path, platform):
    """PS5/Switch tipi tek liste."""
    rows = read_rows(path)[1:]
    games = {}
    for r in rows:
        r = (r + ["", "", "", ""])[:4]
        name, sell, buy, _diff = r[0], r[1], r[2], r[3]
        if not name.strip():
            continue
        nkey = norm(name)
        sell_i, buy_i = to_int(sell), to_int(buy)
        if nkey in games:  # alt taraftaki "sadece alış" satırlarını birleştir
            if games[nkey]["sell"] is None:
                games[nkey]["sell"] = sell_i
            if games[nkey]["buy"] is None:
                games[nkey]["buy"] = buy_i
        else:
            games[nkey] = {"name": name.strip(), "sell": sell_i, "buy": buy_i}
    return finalize(games, platform)


def finalize(games, platform):
    out = []
    seen = set()
    for rec in games.values():
        slug = slugify(rec["name"]) or "oyun"
        gid = f"{platform}-{slug}"
        base, n = gid, 2
        while gid in seen:
            gid = f"{base}-{n}"
            n += 1
        seen.add(gid)
        out.append({
            "id": gid,
            "name": rec["name"],
            "platform": platform,
            "sell": rec["sell"],
            "buy": rec["buy"],
            "image": None,
        })
    out.sort(key=lambda g: g["name"].lower())
    return out


def main():
    all_games = []
    all_games += parse_dual(SRC / "ps4.csv", "ps4")
    all_games += parse_single(SRC / "ps5.csv", "ps5")
    all_games += parse_single(SRC / "switch1.csv", "switch1")
    all_games += parse_single(SRC / "switch2.csv", "switch2")

    # Doğrulanmış TM stok kartları: yeni/özel sürümlere ikinci el fiyatı uydurulmaz.
    # Satış fiyatı ve kondisyon canlı stoktan gelir; takas teklifi onaylanana kadar Sor.
    extras_file = SRC / "stok-ekleri.json"
    if extras_file.exists():
        known = {(g['platform'], identity(g['name'])) for g in all_games}
        for extra in json.loads(extras_file.read_text(encoding='utf-8')):
            platform, name = extra['platform'], extra['name']
            key = (platform, identity(name))
            if platform not in PLATFORM_LABELS or not name.strip() or key in known:
                raise ValueError(f'Geçersiz / yinelenen stok eki: {name}')
            game = finalize({key: {'name': name, 'sell': None, 'buy': None}}, platform)[0]
            game['image'] = extra.get('image')
            all_games.append(game)
            known.add(key)

    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}

    # mevcut images korunsun (yeniden derlemede kapakları kaybetme)
    if OUT.exists():
        try:
            old = {g["id"]: g.get("image") for g in json.loads(OUT.read_text(encoding="utf-8"))["games"]}
            for g in all_games:
                if old.get(g["id"]):
                    g["image"] = old[g["id"]]
        except Exception:
            pass

    counts = {}
    for g in all_games:
        counts[g["platform"]] = counts.get(g["platform"], 0) + 1

    payload = {
        "updatedAt": previous.get("updatedAt"),
        "platforms": PLATFORM_LABELS,
        "counts": counts,
        "total": len(all_games),
        "games": all_games,
    }
    # Kapak/derleme değil, gerçek liste veya fiyat değişikliği tarihi.
    def pricing(rows):
        return sorted((g['id'], g['name'], g['platform'], g['sell'], g['buy']) for g in rows)
    if pricing(previous.get('games', [])) != pricing(all_games):
        payload['updatedAt'] = datetime.now(ZoneInfo('Europe/Istanbul')).strftime('%Y-%m-%d %H:%M')
    ids = [g['id'] for g in all_games]
    if len(ids) != len(set(ids)) or not all_games:
        raise ValueError('Boş katalog veya tekrarlanan oyun kimliği')
    target = OUT.with_suffix('.json.tmp')
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8')
    target.replace(OUT)
    print(f"✅ {len(all_games)} oyun → {OUT}")
    for p, c in counts.items():
        print(f"   {PLATFORM_LABELS[p]:22} {c}")


if __name__ == "__main__":
    main()
