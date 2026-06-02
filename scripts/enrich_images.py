#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Oyun Kapak Resmi Zenginleştirici (RAWG)
=====================================================
data/games.json içindeki "image": null olan oyunlara RAWG.io oyun
veritabanından kapak görseli ekler. Mevcut kapakları korur.

KURULUM (tek seferlik, ücretsiz):
  1. https://rawg.io/apidocs adresinden ücretsiz API anahtarı al.
  2. Anahtarı ortam değişkeni olarak ver:
        export RAWG_KEY="senin_anahtarin"
  3. Çalıştır:
        python3 scripts/enrich_images.py

Notlar:
  - İsimden otomatik eşleşir; bulunamayanlar null kalır (kart ikon gösterir).
  - İstediğin zaman tekrar çalıştırılabilir; sadece eksikleri doldurur.
  - --limit N ile tek seferde kaç oyun işleneceğini sınırlayabilirsin.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "games.json"
RAWG_KEY = os.environ.get("RAWG_KEY", "").strip()
API = "https://api.rawg.io/api/games"

# RAWG platform id'leri (eşleşme isabetini artırır)
PLATFORM_HINT = {"ps4": 18, "ps5": 187, "switch1": 7, "switch2": 7}


def clean(name):
    """Eşleşmeyi bozan ekleri sadeleştir (Türkçe, GOTY, sürüm vb.)."""
    n = name
    for junk in ["Türkçe Dublaj", "Türkçe Spiker", "Türkçe", "Turkçe", "TÜRKÇE",
                 "Gold Edition", "Deluxe Edition", "Ultimate Edition",
                 "Definitive Edition", "Complete Edition", "GOTY", "G.O.T.Y",
                 "Game Of The Year Edition", "VR Uyumlu", "VR"]:
        n = re.sub(re.escape(junk), "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s+", " ", n).strip(" -:·")
    return n


def fetch_cover(name, platform):
    q = clean(name)
    params = {"key": RAWG_KEY, "search": q, "page_size": 1, "search_precise": "true"}
    pid = PLATFORM_HINT.get(platform)
    if pid:
        params["platforms"] = pid
    url = API + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KonsolTech/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode("utf-8"))
        results = data.get("results") or []
        if results:
            u = results[0].get("background_image")
            if u and "media.rawg.io/media/" in u and "/resize/" not in u:
                u = u.replace("/media/", "/media/resize/420/-/", 1)  # hafif sürüm
            return u
    except Exception as e:
        print(f"   ! {name}: {e}", file=sys.stderr)
    return None


def main():
    if not RAWG_KEY:
        print("❌ RAWG_KEY tanımlı değil.\n"
              "   https://rawg.io/apidocs adresinden ücretsiz anahtar al, sonra:\n"
              '   export RAWG_KEY="anahtarin" && python3 scripts/enrich_images.py')
        sys.exit(1)

    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    games = payload["games"]
    todo = [g for g in games if not g.get("image")]
    if limit:
        todo = todo[:limit]

    print(f"🎮 {len(todo)} oyun için kapak aranıyor (toplam {len(games)})…")
    found = 0
    for i, g in enumerate(todo, 1):
        cover = fetch_cover(g["name"], g["platform"])
        if cover:
            g["image"] = cover
            found += 1
        if i % 25 == 0:
            print(f"   …{i}/{len(todo)} işlendi, {found} kapak bulundu")
            DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(0.3)  # API'ye nazik ol

    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ Bitti: {found}/{len(todo)} kapak eklendi → {DATA}")


if __name__ == "__main__":
    main()
