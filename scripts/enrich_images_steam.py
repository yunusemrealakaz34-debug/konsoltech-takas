#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Anahtarsız Kapak Zenginleştirici (Steam)
======================================================
Steam'in herkese açık mağaza arama API'sinden (anahtar GEREKMEZ) oyun
kapaklarını çeker. Yalnızca isim benzerliği yüksekse kabul eder; böylece
yanlış kapak riski düşer. Eşleşmeyen oyunlar "image": null kalır (ikon gösterir).

Not: Steam'de olmayan konsol-özel oyunlar (Nintendo, God of War, Last of Us,
Bloodborne, Demon's Souls, Gran Turismo vb.) eşleşmez — onlar için sonradan
RAWG anahtarıyla scripts/enrich_images.py kullanılabilir.

Çalıştır:  python3 scripts/enrich_images_steam.py [--limit N]
"""
import difflib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "games.json"
SEARCH = "https://store.steampowered.com/api/storesearch/?cc=tr&l=turkish&term="
COVER = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/library_600x900.jpg"
HEADER = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/header.jpg"
UA = {"User-Agent": "Mozilla/5.0 (compatible; KonsolTechBot/1.0)"}
CUTOFF = 0.72  # isim benzerlik eşiği


def clean(name):
    n = name
    for junk in ["Türkçe Dublaj", "Türkçe Spiker", "Türkçe", "Turkçe", "TÜRKÇE",
                 "Gold Edition", "Deluxe Edition", "Ultimate Edition", "Eski", "Yeni",
                 "Definitive Edition", "Complete Edition", "Complette Edition", "GOTY",
                 "G.O.T.Y.", "G.O.T.Y", "Game Of The Year Edition", "VR Uyumlu",
                 "Director's Cut", "Remastered", "Intergrade"]:
        n = re.sub(re.escape(junk), "", n, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", n).strip(" -:·")


def norm(s):
    s = (s or "").lower()
    tr = {"ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c", "â": "a", "’": "'"}
    for k, v in tr.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def url_ok(url):
    try:
        req = urllib.request.Request(url, headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status == 200
    except Exception:
        return False


def find_cover(name):
    q = clean(name)
    try:
        req = urllib.request.Request(SEARCH + urllib.parse.quote(q), headers=UA)
        with urllib.request.urlopen(req, timeout=15) as r:
            items = json.loads(r.read().decode("utf-8")).get("items", [])
    except Exception as e:
        print(f"   ! {name}: {e}", file=sys.stderr)
        return None
    if not items:
        return None
    target = norm(q)
    best, best_r = None, 0.0
    for it in items[:5]:
        ratio = difflib.SequenceMatcher(None, target, norm(it.get("name", ""))).ratio()
        if ratio > best_r:
            best, best_r = it, ratio
    if not best or best_r < CUTOFF:
        return None
    aid = best.get("id")
    cover = COVER.format(id=aid)
    if url_ok(cover):
        return cover
    header = HEADER.format(id=aid)
    return header if url_ok(header) else None


def main():
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    games = payload["games"]
    todo = [g for g in games if not g.get("image")]
    if limit:
        todo = todo[:limit]
    print(f"🎮 {len(todo)} oyun için Steam kapağı aranıyor…")
    found = 0
    for i, g in enumerate(todo, 1):
        cov = find_cover(g["name"])
        if cov:
            g["image"] = cov
            found += 1
        if i % 25 == 0:
            print(f"   …{i}/{len(todo)} | {found} kapak")
            DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(0.25)
    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ {found}/{len(todo)} kapak eklendi → {DATA}")


if __name__ == "__main__":
    main()
