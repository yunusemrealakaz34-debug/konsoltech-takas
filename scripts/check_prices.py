#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Fiyat Sapma Bekçisi (oyunmerkezi/psoyunmerkezi)
============================================================
Rakip takas-hesaplama sayfalarındaki RSFormProPrices haritalarını çeker,
bizim data/games.json ile karşılaştırır, riskleri data/fiyat-uyari.txt'ye yazar.

Risk tanımları:
  RİSK-1: bizim alış >= rakip satış  → takasla gelen oyun piyasada satılamaz (zarar)
  RİSK-2: bizim alış  > rakip alış   → piyasadan pahalı alıyoruz (marj erir)
  BİLGİ : bizim satış > rakip satış  → pahalı görünürüz (satılmaz, zarar değil)

Çalıştır:  python3 scripts/check_prices.py
"""
import json
import re
import sys
import html
import difflib
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT / "data" / "games.json"
OUT = ROOT / "data" / "fiyat-uyari.txt"

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
SOURCES = {
    "ps4":     "https://www.psoyunmerkezi.com/ps4-oyun-takas-hesaplama",
    "ps5":     "https://www.oyunmerkezi.com.tr/ps5-oyun-takas-hesaplama",
    "switch1": "https://www.oyunmerkezi.com.tr/nintendo-switch-oyun-takas-hesaplama",
    "switch2": "https://www.oyunmerkezi.com.tr/nintendo-switch-2-oyun-takas-hesaplama",
}


def norm(s):
    s = (s or "").strip().lower()
    for a, b in {"ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c", "’": "'"}.items():
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def fetch_maps(url):
    """Sayfadaki RSFormProPrices['<id>_al'] / ['<id>_ver'] → {'al': {ad:TL}, 'ver': {...}}"""
    h = None
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                h = r.read().decode("utf-8", errors="replace")
            break
        except Exception as e:
            print(f"   ! deneme {attempt}/2 {url}: {e}", file=sys.stderr)
    if h is None:
        return None
    out = {}
    for m in re.finditer(r"RSFormProPrices\['\d+_(al|ver)'\]\s*=\s*\{(.*?)\};", h, re.S):
        d = out.setdefault(m.group(1), {})
        for k, v in re.findall(r"'((?:[^'\\]|\\.)*)'\s*:\s*'([^']*)'", m.group(2)):
            n = re.sub(r"[^\d]", "", v)
            if k and n:
                d[html.unescape(k.replace("\\'", "'")).strip()] = int(n)
    return out if out.get("al") else None


def main():
    games = json.loads(GAMES.read_text(encoding="utf-8"))["games"]
    risk1, risk2, info, fetch_fail = [], [], [], []

    for plat, url in SOURCES.items():
        maps = fetch_maps(url)
        if not maps:
            fetch_fail.append(f"{plat}: {url}")
            continue
        ral = {norm(k): v for k, v in maps.get("al", {}).items()}
        rver = {norm(k): v for k, v in maps.get("ver", {}).items()}
        keys = list(ral)
        for g in (x for x in games if x["platform"] == plat):
            nk = norm(g["name"])
            ra, rv = ral.get(nk), rver.get(nk)
            if ra is None and rv is None:
                close = difflib.get_close_matches(nk, keys, n=1, cutoff=0.93)
                if close:
                    ra, rv = ral[close[0]], rver.get(close[0])
                else:
                    continue
            buy, sell = g.get("buy"), g.get("sell")
            line = f"{plat.upper():7} {g['name'][:42]:42}"
            if buy and ra and buy >= ra:
                risk1.append(f"{line} bizim alış {buy} >= rakip satış {ra}")
            elif buy and rv and buy > rv:
                risk2.append(f"{line} bizim alış {buy} > rakip alış {rv}")
            if sell and ra and sell > ra:
                info.append(f"{line} bizim satış {sell} > rakip satış {ra}")

    lines = ["KonsolTech — Fiyat Sapma Raporu (rakip: oyunmerkezi/psoyunmerkezi)", ""]
    if fetch_fail:
        lines += ["## ÇEKİLEMEDİ (URL/yapı değişmiş olabilir)"] + [f"  {x}" for x in fetch_fail] + [""]
    lines += [f"## RİSK-1 — ZARAR: alışımız rakibin satışının üstünde ({len(risk1)})"]
    lines += [f"  {x}" for x in risk1] or ["  yok ✓"]
    lines += ["", f"## RİSK-2 — FAZLA ÖDEME: alışımız rakibin alışının üstünde ({len(risk2)})"]
    lines += [f"  {x}" for x in risk2] or ["  yok ✓"]
    lines += ["", f"## BİLGİ — PAHALI GÖRÜNÜM: satışımız rakibin üstünde ({len(info)})"]
    lines += [f"  {x}" for x in info] or ["  yok ✓"]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✅ Rapor → {OUT}  (risk1={len(risk1)}, risk2={len(risk2)}, bilgi={len(info)})")


if __name__ == "__main__":
    main()
