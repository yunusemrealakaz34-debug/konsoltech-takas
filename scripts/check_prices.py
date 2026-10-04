#!/usr/bin/env python3
"""Compare advertised exchange prices with actual condition-aware KonsolTech prices.

Report only: competitor data never overwrites sale/trade offers or stock quantities.
Use --snapshot-dir for reproducible offline checks of saved public responses.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import html
import json
from pathlib import Path
import re
import urllib.request
from zoneinfo import ZoneInfo
from catalog_common import identity, money

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT / 'data/games.json'
SOURCES = {
    'ps4': 'https://www.psoyunmerkezi.com/ps4-oyun-takas-hesaplama',
    'ps5': 'https://www.oyunmerkezi.com.tr/ps5-oyun-takas-hesaplama',
    'switch1': 'https://www.oyunmerkezi.com.tr/nintendo-switch-oyun-takas-hesaplama',
    'switch2': 'https://www.oyunmerkezi.com.tr/nintendo-switch-2-oyun-takas-hesaplama',
}
STOCK_URL = 'https://app.konsoltech.tr/api/takas-stok.json'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'KonsolTech-PriceReview/1.0'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode('utf-8')


def parse_maps(page):
    maps = {'al': {}, 'ver': {}}
    for match in re.finditer(r"RSFormProPrices\['\d+_(al|ver)'\]\s*=\s*\{(.*?)\};", page, re.S):
        for name, price in re.findall(r"'((?:[^'\\]|\\.)*)'\s*:\s*'([^']*)'", match[2]):
            name = html.unescape(name.replace("\\'", "'")).strip()
            if name:
                value = money(price, signed=match[1] == 'ver')
                if value is not None:
                    maps[match[1]][name] = value
    if not maps['al'] or not maps['ver']:
        raise ValueError('Satış veya takas fiyat haritası boş; kaynak yapısı değişmiş olabilir.')
    return maps


def fetch_maps(url):
    return parse_maps(fetch(url))


def indexed(values):
    result = {}
    for title, value in values.items():
        key = identity(title)
        if key in result and result[key] != value:
            raise ValueError(f'Aynı oyun için çelişkili fiyat: {title}')
        result[key] = value
    return result


def effective_sell(game, stock):
    entry = stock.get(game['id'], {})
    used = entry.get('varyantlar', {}).get('2el', {})
    if not used and 'varyantlar' not in entry and entry.get('durum', '2el') == '2el':
        used = entry
    value = used.get('satis')
    if used.get('stokta') is True and isinstance(value, (float, int)) and not isinstance(value, bool) and value > 0:
        return value, True
    return game.get('sell'), False


def compare(games, maps, stock):
    rows, missing, uncertain = [], [], []
    ours = {}
    for game in games:
        ours.setdefault((game['platform'], identity(game['name'])), []).append(game)
    for platform, data in maps.items():
        sells, buys = indexed(data['al']), indexed(data['ver'])
        titles = {identity(title): title for title in [*data['ver'], *data['al']]}
        for key, name in titles.items():
            candidates = ours.get((platform, key), [])
            if not candidates:
                missing.append({'platform': platform, 'name': name, 'competitor_sell': sells.get(key),
                                'competitor_buy': buys.get(key), 'source': SOURCES[platform]})
            elif len(candidates) != 1:
                uncertain.append({'platform': platform, 'name': name, 'reason': 'Birden fazla katalog kimliği'})
        for game in (g for g in games if g['platform'] == platform):
            key = identity(game['name'])
            if key not in titles or len(ours[(platform, key)]) != 1:
                continue
            sale, stocked = effective_sell(game, stock)
            buy, remote_sell, remote_buy = game.get('buy'), sells.get(key), buys.get(key)
            row = {'id': game['id'], 'platform': platform, 'name': game['name'],
                   'our_buy': buy, 'catalog_sell': game.get('sell'), 'effective_sell': sale,
                   'stocked_used': stocked, 'competitor_sell': remote_sell, 'competitor_buy': remote_buy,
                   'sell_difference': sale-remote_sell if sale is not None and remote_sell is not None else None,
                   'buy_difference': buy-remote_buy if buy is not None and remote_buy is not None else None,
                   'source': SOURCES[platform], 'flags': []}
            if buy is not None and sale is not None and buy >= sale: row['flags'].append('alış ≥ kendi satışımız')
            if buy is not None and remote_sell is not None and buy >= remote_sell: row['flags'].append('alış ≥ rakip satış')
            if buy is not None and remote_buy is not None and buy > remote_buy: row['flags'].append('alış > rakip alış')
            rows.append(row)
    return rows, missing, uncertain


def write_atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix+'.tmp'); temp.write_text(text, encoding='utf-8'); temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot-dir', type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'data')
    args = parser.parse_args()
    failures = {}
    def load_source(item):
        platform, url = item
        try:
            page = (args.snapshot_dir/(platform+'.html')).read_text() if args.snapshot_dir else fetch(url)
            return platform, parse_maps(page), None
        except Exception as error:
            return platform, None, str(error)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(load_source, SOURCES.items()))
    maps = {}
    for platform, value, error in results:
        if error: failures[platform] = error
        else: maps[platform] = value
    try:
        stock = json.loads((args.snapshot_dir/'stock.json').read_text() if args.snapshot_dir else fetch(STOCK_URL))
        if not isinstance(stock, dict) or 'hata' in stock: raise ValueError('Stok doğrulanamadı')
    except Exception as error:
        stock = {}; failures['stock'] = str(error)
    games = json.loads(GAMES.read_text())['games']
    rows, missing, uncertain = compare(games, maps, stock)
    checked = datetime.now(ZoneInfo('Europe/Istanbul')).isoformat(timespec='seconds')
    summary = {'catalog_total': len(games), 'matched': len(rows), 'missing_candidates': len(missing),
               'missing_by_platform': dict(Counter(v['platform'] for v in missing)),
               'sale_price_differences': sum(r['sell_difference'] not in (None, 0) for r in rows),
               'trade_price_differences': sum(r['buy_difference'] not in (None, 0) for r in rows),
               'at_or_above_own_sale': sum('alış ≥ kendi satışımız' in r['flags'] for r in rows),
               'at_or_above_competitor_sale': sum('alış ≥ rakip satış' in r['flags'] for r in rows)}
    payload = {'checkedAt': checked, 'complete': not failures, 'failures': failures, 'summary': summary,
               'note': 'İlan edilen fiyatlar; rakip stok/kondisyon doğrulanmadı. Eksikler adaydır; çıkış/sürüm kontrolü gerekir. Fiyatlar değiştirilmez.',
               'comparisons': rows, 'missing': missing, 'ambiguous': uncertain}
    lines = ['KonsolTech — Fiyat Karşılaştırması', checked,
             'İlan fiyatlarıdır; rakip stok/kondisyon garanti değildir. Fiyatlar otomatik değiştirilmez.',
             json.dumps(summary, ensure_ascii=False), '']
    if failures: lines += ['EKSİK DENETİM: '+json.dumps(failures, ensure_ascii=False), '']
    for row in rows:
        if row['flags'] or row['sell_difference'] not in (None, 0) or row['buy_difference'] not in (None, 0):
            lines.append(f"{row['platform']} | {row['name']} | Biz alış/satış: {row['our_buy']}/{row['effective_sell']} | Rakip: {row['competitor_buy']}/{row['competitor_sell']} | {', '.join(row['flags'])}")
    new_lines = ['Katalogda eşleşmeyen aday oyunlar', checked, 'Yazım, sürüm, fiziksel çıkış ve fiyat onayından sonra eklenir.', '']
    for row in missing:
        new_lines.append(f"{row['platform']} | {row['name']} | Rakip alış/satış: {row['competitor_buy']}/{row['competitor_sell']}")
    # A partial run must fail visibly; preserve the last complete published report.
    if failures:
        write_atomic(args.output_dir/'fiyat-denetim-hata.json',json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'complete':False,'failures':failures},ensure_ascii=False));return 1
    write_atomic(args.output_dir/'fiyat-denetim.json',json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    write_atomic(args.output_dir/'fiyat-uyari.txt','\n'.join(line.rstrip() for line in lines)+'\n')
    write_atomic(args.output_dir/'yeni-oyunlar.txt','\n'.join(new_lines)+'\n')
    print(json.dumps(summary,ensure_ascii=False));return 0


if __name__ == '__main__':
    raise SystemExit(main())
