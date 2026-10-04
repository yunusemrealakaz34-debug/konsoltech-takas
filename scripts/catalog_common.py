"""Conservative catalogue identities and strict TRY parsing (no fuzzy sequels)."""
import html
import re
import unicodedata
from decimal import Decimal


def norm(value):
    value = html.unescape(str(value or '')).replace('İ', 'I').replace('ı', 'i').lower()
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', value)).strip()


# Explicit spelling aliases only. Numbers and edition names otherwise remain significant.
_PAIRS = [
    ('Amoong Us Crewmate Edition', 'Among Us Crewmate Edition'),
    ("Assassin's Creed IV Black Flag", "Assassin's Creed 4 Black Flag"),
    ("Assassin's Creed Odysses", "Assassin's Creed Odyssey"),
    ("Assassin's Creed Rouge", 'Assassins Creed Rogue'),
    ('Asseetto Corsa', 'Assetto Corsa'),
    ('Hello Neigbor Hide & Seek', 'Hello Neighbor Hide & Seek'),
    ('Spider-Man 2 The Amazing', 'Spider-Man The Amazing 2'),
    ('The Outher Worlds', 'The Outer Worlds'),
    ('Wipeout Omega Colletion', 'Wipeout Omega Collection'),
    ('Zombie', 'Zombi'),
    ('Watch Dogs', 'Watch Dogs 1'),
    ('FC 27 Türkçe Spiker', 'FC 27'),
    ('Dragon Ball Xenoverse', 'Dragon Ball 1 Xenoverse'),
    ('Naruto Trilogy', 'Naruto Trilogy 3'),
    ('Famring Simulator 22', 'Farming Simulator 22'),
    ('Metro Exodus Complette Edition', 'Metro Exodus Complete Edition'),
    ('Pes 2021 Türklçe', 'Pes 2021 Türkçe'),
    ('Animal Crosssing New Horizons', 'Animal Crossing New Horizons'),
]
_ALIASES = {norm(a).replace(' ', ''): norm(b).replace(' ', '') for a, b in _PAIRS}


def identity(value):
    key = norm(value).replace(' ', '')
    return _ALIASES.get(key, key)


def money(value, *, signed=False):
    """Accept TRY values without dropping decimal separators or arbitrary text."""
    if value is None or not str(value).strip():
        return None
    text = re.sub(r'\s*(?:TL|TRY|₺)\s*', '', str(value).strip(), flags=re.I).strip()
    if re.fullmatch(r'[+-]?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?', text):
        text = text.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'[+-]?\d+(?:[.,]\d{1,2})?', text):
        text = text.replace(',', '.')
    else:
        raise ValueError(f'Geçersiz fiyat: {value!r}')
    number = Decimal(text)
    if number < 0 and not signed:
        raise ValueError(f'Negatif katalog fiyatı: {value!r}')
    number = abs(number) if signed else number
    return int(number) if number == number.to_integral() else float(number)
