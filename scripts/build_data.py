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
import difflib
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


def to_int(val):
    """'1.299 TL' / '+1000' / '' → int|None"""
    if val is None:
        return None
    s = re.sub(r"[^\d]", "", str(val))
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


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
            sell_map[norm(sname)] = (sname.strip(), to_int(sprice))
        if bname.strip():
            buy_map[norm(bname)] = (bname.strip(), to_int(bprice))

    games = {}  # norm -> record

    # önce satış listesi
    for nkey, (disp, price) in sell_map.items():
        games[nkey] = {"name": disp, "sell": price, "buy": None}

    # alış listesini eşleştir (typo'lar için fuzzy)
    sell_keys = list(sell_map.keys())
    for nkey, (disp, price) in buy_map.items():
        match = nkey if nkey in games else None
        if match is None:
            close = difflib.get_close_matches(nkey, sell_keys, n=1, cutoff=0.9)
            match = close[0] if close else None
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
        "updatedAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
        "platforms": PLATFORM_LABELS,
        "counts": counts,
        "total": len(all_games),
        "games": all_games,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ {len(all_games)} oyun → {OUT}")
    for p, c in counts.items():
        print(f"   {PLATFORM_LABELS[p]:22} {c}")


if __name__ == "__main__":
    main()
