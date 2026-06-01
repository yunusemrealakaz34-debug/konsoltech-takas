#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Yeni Oyun Tespitçisi (oyunmerkezi/psoyunmerkezi)
=============================================================
Rakip takas sayfalarındaki oyun BAŞLIKLARINI çeker (statik HTML'deki
checkbox listesi) ve bizim data/games.json listemizle karşılaştırır.
Bizde OLMAYAN yeni başlıkları rapor eder → fiyatını ekleyip CSV'ye
koyman için.

NOT: O sitelerde fiyatlar JS hesaplayıcı ile sunulduğu için statik olarak
çekilemez; bu script sadece "hangi yeni oyunlar eklenmiş" sorusunu yanıtlar.

Çalıştır:  python3 scripts/check_new_games.py
Çıktı:     data/yeni-oyunlar.txt  (+ ekrana özet)
"""
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "games.json"
OUT = ROOT / "data" / "yeni-oyunlar.txt"

SOURCES = {
    "ps5":     "https://www.oyunmerkezi.com.tr/ps5-oyun-takas-hesaplama",
    "switch1": "https://www.oyunmerkezi.com.tr/nintendo-switch-oyun-takas-hesaplama",
    "switch2": "https://www.oyunmerkezi.com.tr/nintendo-switch-2-oyun-takas-hesaplama",
    # PS4 ayrı alan adında:
    "ps4":     "https://www.psoyunmerkezi.com/ps4-oyun-takas-hesaplama",
}

UA = {"User-Agent": "Mozilla/5.0 (compatible; KonsolTechBot/1.0)"}


def norm(s):
    s = (s or "").strip().lower()
    tr = {"ı": "i", "İ": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c", "’": "'"}
    for k, v in tr.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def fetch_titles(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            page = r.read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"   ! {url}: {e}", file=sys.stderr)
        return []
    # checkbox value="Oyun Adı" yapısından başlıkları çek
    vals = re.findall(r'name="form\[[^\]]+\]\[\]"[^>]*value="([^"]+)"', page)
    if not vals:  # genel fallback
        vals = re.findall(r'type="checkbox"[^>]*value="([^"]+)"', page)
    # gürültüyü ele (onay kutusu metni vb.)
    out = []
    for v in vals:
        v = html.unescape(v).strip()
        if len(v) > 2 and not v.lower().startswith("kabul"):
            out.append(v)
    return out


def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    ours = {}
    for g in payload["games"]:
        ours.setdefault(g["platform"], set()).add(norm(g["name"]))

    lines = []
    total_new = 0
    for plat, url in SOURCES.items():
        titles = fetch_titles(url)
        if not titles:
            lines.append(f"## {plat.upper()} — çekilemedi (URL/yapı değişmiş olabilir)\n")
            continue
        seen = set()
        new = []
        for t in titles:
            n = norm(t)
            if n in seen:
                continue
            seen.add(n)
            if n not in ours.get(plat, set()):
                new.append(t)
        total_new += len(new)
        lines.append(f"## {plat.upper()} — sitede {len(seen)} oyun, bizde olmayan {len(new)}:")
        lines += [f"  - {t}" for t in sorted(new)] or ["  (hepsi listede ✓)"]
        lines.append("")
        print(f"{plat.upper():8} sitede {len(seen):4d} | yeni {len(new)}")

    header = ("KonsolTech — oyunmerkezi'de olup bizde OLMAYAN oyunlar\n"
              "Fiyatlarını belirleyip ilgili CSV'ye ekle, sonra build_data.py çalıştır.\n"
              + "=" * 60 + "\n\n")
    OUT.write_text(header + "\n".join(lines), encoding="utf-8")
    print(f"\n✅ Toplam {total_new} yeni başlık → {OUT}")


if __name__ == "__main__":
    main()
