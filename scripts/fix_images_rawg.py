#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KonsolTech — Kapak Doğrulama & Düzeltme (RAWG, katı eşleştirme)
===============================================================
Mevcut kapakları yeniden değerlendirir. Numaralı seriler (UFC 4, NBA 2K26,
FC 25, Call of Duty ...) için YANLIŞ eşleşmeleri düzeltir:
  - Arama adında sayı/yıl KORUNUR.
  - Sonuç adıyla benzerlik + sayı eşleşmesi zorunlu (franchise'ın ilk
    sonucunu yanlışlıkla almayı engeller).
  - Güvenli eşleşme bulunamazsa mevcut kapak korunur.

Çalıştır:  RAWG_KEY=... python3 scripts/fix_images_rawg.py
"""
import difflib
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
KEY = os.environ.get("RAWG_KEY", "").strip()
API = "https://api.rawg.io/api/games"
PLATFORM_HINT = {"ps4": 18, "ps5": 187, "switch1": 7, "switch2": 7}

SUFFIX = ["Türkçe Dublaj", "Türkçe Spiker", "Türkçe", "Turkçe", "TÜRKÇE", "Türklçe",
          "Spiker", "Gold Edition", "Deluxe Edition", "Ultimate Edition",
          "Definitive Edition", "Complete Edition", "Complette Edition",
          "Game Of The Year Edition", "GOTY", "G.O.T.Y.", "G.O.T.Y",
          "VR Uyumlu", "Eski", "Yeni"]


def query_of(name):
    n = name
    for j in SUFFIX:
        n = re.sub(re.escape(j), "", n, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", n).strip(" -:·")


def norm(s):
    s = (s or "").lower()
    for k, v in {"ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c",
                 "â": "a", "î": "i", "’": "'"}.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def score(query, result_name):
    qn, rn = norm(query), norm(result_name)
    if not qn or not rn:
        return 0.0
    ratio = difflib.SequenceMatcher(None, qn, rn).ratio()
    qd = set(re.findall(r"\d+", qn))
    rd = set(re.findall(r"\d+", rn))
    if qd and not qd.issubset(rd):
        # istisna: "X 1" (seride ilk) RAWG'de numarasız "X" ile eşleşir
        if qd == {"1"} and not rd:
            qn1 = re.sub(r"\b1\b", "", qn).strip()
            r2 = difflib.SequenceMatcher(None, qn1, rn).ratio()
            if qn1 and (qn1 in rn or rn in qn1):
                return max(r2, 0.86)
            return r2
        return ratio * 0.35           # sayı/yıl uyuşmuyor → ağır ceza
    if qn in rn or rn in qn:
        return max(ratio, 0.88)        # tam içerik → güçlü kabul
    return ratio


def best_cover(name, platform):
    q = query_of(name)
    params = {"key": KEY, "search": q, "page_size": 8}
    pid = PLATFORM_HINT.get(platform)
    if pid:
        params["platforms"] = pid
    url = API + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KonsolTech/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            results = json.loads(r.read().decode("utf-8")).get("results", [])
    except Exception as e:
        print(f"   ! {name}: {e}", file=sys.stderr)
        return None, 0.0
    best, best_s = None, 0.0
    for it in results:
        s = score(q, it.get("name", ""))
        if s > best_s and it.get("background_image"):
            best, best_s = it, s
    if best and best_s >= 0.72:
        return best["background_image"], best_s
    return None, best_s


def main():
    if not KEY:
        print("❌ RAWG_KEY gerekli."); sys.exit(1)
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    games = payload["games"]
    changed = fixed = kept = 0
    for i, g in enumerate(games, 1):
        cover, s = best_cover(g["name"], g["platform"])
        if cover and cover != g.get("image"):
            g["image"] = cover
            changed += 1
        elif cover:
            kept += 1
        # güvenli eşleşme yoksa mevcut kapak dokunulmaz
        if i % 50 == 0:
            print(f"   …{i}/{len(games)} | değişen {changed}")
            DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(0.28)
    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    cov = sum(1 for x in games if x.get("image"))
    print(f"✅ Bitti: {changed} kapak güncellendi/düzeltildi | kapaklı {cov}/{len(games)}")


if __name__ == "__main__":
    main()
