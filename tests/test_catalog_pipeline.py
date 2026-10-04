"""Regression coverage for financial parsing, sequel identities and audit freshness."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import build_data
import check_prices
from catalog_common import identity, money, norm
from check_prices import compare, effective_sell, parse_maps


class CatalogPipelineTests(unittest.TestCase):
    def test_turkish_unicode_and_explicit_aliases(self):
        self.assertEqual(norm('İT TAKES TWO'), 'it takes two')
        self.assertEqual(identity('Ghost of Yōtei'), identity('Ghost Of Yotei'))
        self.assertEqual(identity("Assassin’s Creed Mirage"), identity('Assassins Creed Mirage'))
        self.assertEqual(identity('Watch Dogs'), identity('Watch Dogs 1'))
        for a,b in [('Watch Dogs', 'Watch Dogs 2'), ('FIFA 23', 'FIFA 22'),
                    ('Resident Evil 4', 'Resident Evil 4 Gold Edition'),
                    ('Dragon Ball Xenoverse', 'Dragon Ball 2 Xenoverse')]:
            self.assertNotEqual(identity(a), identity(b))

    def test_money_preserves_decimals_and_rejects_noise(self):
        for value,expected in [('1.299 TL',1299), ('1.299,50 TL',1299.5),('1299.50',1299.5),('',None)]:
            self.assertEqual(money(value),expected)
        self.assertEqual(money('-2400',signed=True),2400)
        for value in ['-500','Sor','12abc34','NaN','1.299.50']:
            with self.assertRaises(ValueError): money(value)

    def test_dual_list_does_not_steal_sequel_offer(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/'ps4.csv'
            file.write_text('name;sell;name;buy\nWatch Dogs 1;399;Watch Dogs;200\nWatch Dogs 2;699;Watch Dogs 2;350\nNaruto Storm 4;799;Naruto Storm;450\n')
            games={g['name']:g for g in build_data.parse_dual(file,'ps4')}
        self.assertEqual(games['Watch Dogs 1']['buy'],200)
        self.assertEqual(games['Watch Dogs 2']['buy'],350)
        self.assertIsNone(games['Naruto Storm 4']['buy'])
        self.assertEqual(games['Naruto Storm']['buy'],450)

    def test_noop_rebuild_retains_date_images_and_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);out=root/'games.json'
            for platform in ['ps4','ps5','switch1','switch2']:
                (root/(platform+'.csv')).write_text('name;sell;buy;diff\n'+('Game;1000;600;400\n' if platform=='ps5' else ''))
            with patch.object(build_data,'SRC',root),patch.object(build_data,'OUT',out),contextlib.redirect_stdout(io.StringIO()):
                build_data.main()
                old=json.loads(out.read_text());old['updatedAt']='2026-07-23 12:00';old['games'][0]['image']='https://example.com/cover.jpg'
                out.write_text(json.dumps(old));build_data.main()
                self.assertEqual(json.loads(out.read_text()),old)
                (root/'ps5.csv').write_text('name;sell;buy;diff\nGame;1200;600;600\n')
                build_data.main();self.assertNotEqual(json.loads(out.read_text())['updatedAt'],old['updatedAt'])

    def test_ambiguous_naruto_source_does_not_publish_a_guessed_offer(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/'ps4.csv'
            file.write_text('name;sell;name;buy\nNaruto Shippuden Ultimate Ninja Storm 4;999;Naruto Shippuden Ultimate Ninja Strom;450\n')
            with contextlib.redirect_stdout(io.StringIO()):
                games=build_data.parse_dual(file,'ps4')
        self.assertEqual(len(games),1)
        self.assertIsNone(games[0]['buy'])

    def test_stock_additions_preserve_edition_without_inventing_prices(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out=root/'games.json'
            for platform in ['ps4','ps5','switch1','switch2']:
                (root/(platform+'.csv')).write_text('name;sell;buy;diff\n')
            (root/'stok-ekleri.json').write_text(json.dumps([{'platform':'ps5','name':'Game Steelbook','image':'https://example.com/cover.jpg'}]))
            with patch.object(build_data,'SRC',root),patch.object(build_data,'OUT',out),contextlib.redirect_stdout(io.StringIO()):
                build_data.main()
                game=json.loads(out.read_text())['games'][0]
                self.assertEqual(game['name'],'Game Steelbook')
                self.assertIsNone(game['buy']);self.assertIsNone(game['sell'])
                self.assertEqual(game['image'],'https://example.com/cover.jpg')
                (root/'ps5.csv').write_text('name;sell;buy;diff\nGame Steelbook;1000;700;300\n')
                with self.assertRaises(ValueError):build_data.main()

    def test_source_maps_require_both_sides(self):
        page="RSFormProPrices['18_al'] = {'Game': '1.299,50'}; RSFormProPrices['18_ver'] = {'Game': '-700'};"
        self.assertEqual(parse_maps(page),{'al':{'Game':1299.5},'ver':{'Game':700}})
        with self.assertRaises(ValueError):parse_maps('<html>Site unavailable</html>')

    def test_comparison_uses_live_used_stock_not_catalog_or_new_price(self):
        game={'id':'game','name':'Game','platform':'ps5','sell':1400,'buy':700}
        stock={'game':{'varyantlar':{'2el':{'stokta':True,'satis':700},'sifir':{'stokta':True,'satis':2500}}}}
        rows,missing,_=compare([game],{'ps5':{'al':{'Game':1100},'ver':{'Game':600}}},stock)
        self.assertEqual(rows[0]['effective_sell'],700)
        self.assertIn('alış ≥ kendi satışımız',rows[0]['flags']);self.assertFalse(missing)
        stock['game']['varyantlar']['2el']['stokta']=False
        self.assertEqual(effective_sell(game,stock),(1400,False))

    def test_ambiguous_source_is_rejected_without_guessing(self):
        with self.assertRaises(ValueError):
            compare([],{'ps4':{'al':{'Watch Dogs':500,'Watch Dogs 1':600},'ver':{'Watch Dogs':200}}},{})

    def test_new_game_matching_keeps_numbers_and_platforms(self):
        game={'id':'f26','name':'FC 26','platform':'ps5','sell':1999,'buy':1000}
        rows,missing,_=compare([game],{'ps5':{'al':{'FC 27':3000},'ver':{'FC 27':2000}}},{})
        self.assertFalse(rows);self.assertEqual(missing[0]['name'],'FC 27')

    def test_incomplete_audit_preserves_last_complete_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);out=root/'reports';out.mkdir()
            (out/'fiyat-denetim.json').write_text('{"previous":true}')
            (root/'games.json').write_text('{"games":[]}')
            (root/'stock.json').write_text('{}')
            for platform in check_prices.SOURCES:
                (root/(platform+'.html')).write_text('<html>Unavailable</html>')
            with patch.object(check_prices,'GAMES',root/'games.json'),patch.object(sys,'argv',['check_prices','--snapshot-dir',str(root),'--output-dir',str(out)]),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(check_prices.main(),1)
            self.assertEqual((out/'fiyat-denetim.json').read_text(),'{"previous":true}')
            self.assertFalse(json.loads((out/'fiyat-denetim-hata.json').read_text())['complete'])

if __name__=='__main__':unittest.main()
