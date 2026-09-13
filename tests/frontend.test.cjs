const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./synthetic-dom.cjs');

const game = (id = 'elden', overrides = {}) => ({
  id, name: 'Elden Ring', platform: 'ps5', sell: 1000, buy: 600, image: '', ...overrides
});
const variants = (used, fresh) => ({
  stokta: true, satis: 9999, durum: 'sifir',
  varyantlar: { ...(used ? { '2el': used } : {}), ...(fresh ? { sifir: fresh } : {}) }
});
const stocked = price => ({ stokta: true, satis: price });
const price = card => card.innerHTML.match(/<b>([^<]*)<\/b>/)[1];

test('catalog renders while inventory is pending; selected prices refresh on arrival', async () => {
  const app = await createApp([game()]);
  assert.equal(app.cards().length, 1);
  assert.equal(price(app.card('elden')), '1.000 ₺');
  app.select(app.card('elden'));
  await app.inventory({ elden: variants(stocked(1400), stocked(2100)) });
  assert.equal(app.cards().length, 2);
  assert.equal(app.card('elden').getAttribute('aria-pressed'), 'true');
  assert.equal(app.elements.ktBulkSell.textContent, '1.400 ₺');
  assert.match(app.bulkMessage(), /1\.400 ₺/);
});

test('cards, single WhatsApp, totals and bulk WhatsApp share condition prices', async () => {
  const app = await createApp([game()], { stock: { elden: variants(stocked(1400), stocked(2100)) } });
  const used = app.card('elden'), fresh = app.card('elden', 'sifir');
  assert.equal(price(used), '1.400 ₺');
  assert.equal(price(fresh), '2.100 ₺');
  assert.match(used.innerHTML, /kt-condition-badge[^>]*>2\.El</);
  assert.match(fresh.innerHTML, /kt-condition-badge[^>]*>Sıfır</);
  assert.match(app.singleMessage(used), /2\.El.*Satış 1\.400 ₺/);
  assert.match(app.singleMessage(fresh), /Sıfır.*Satış 2\.100 ₺/);
  app.select(used);
  app.select(app.card('elden', 'sifir'));
  assert.equal(app.elements.ktBulkSell.textContent, '3.500 ₺');
  assert.equal(app.elements.ktBulkCount.textContent, 2);
  app.mode('buy');
  assert.equal(app.cards().length, 1);
  assert.equal(price(app.card('elden')), '600 ₺');
  app.select(app.card('elden'));
  assert.equal(app.elements.ktBulkNetVal.textContent, '2.900 ₺');
  assert.match(app.bulkMessage(), /2\.El — 1\.400 ₺/);
  assert.match(app.bulkMessage(), /Sıfır — 2\.100 ₺/);
  assert.match(app.bulkMessage(), /2\.El — 600 ₺/);
  assert.match(app.bulkMessage(), /Ödenecek fark: 2\.900 ₺/);
});

test('TM private purchase cost is never read or shown', async () => {
  const stock = stocked(1400);
  Object.defineProperty(stock, 'alis', { get() { throw new Error('Private cost read'); } });
  const app = await createApp([game()], { stock: { elden: stock } });
  app.mode('buy');
  assert.equal(price(app.card('elden')), '600 ₺');
  assert.match(app.singleMessage(app.card('elden')), /Takas 600 ₺/);
  app.select(app.card('elden'));
  assert.equal(app.elements.ktBulkBuy.textContent, '600 ₺');
  assert.match(app.bulkMessage(), /Takas toplam: 600 ₺/);
});

test('legacy, missing and sold-out variants cannot leak stale or other-condition prices', async () => {
  const games = ['legacy', 'out', 'new-only', 'empty', 'unmapped', 'legacy-new'].map(id => game(id));
  const app = await createApp(games, { stock: {
    legacy: stocked(1500), out: { stokta: false, satis: 8000 },
    'new-only': variants(null, stocked(2400)), empty: variants(null, null),
    'legacy-new': { ...stocked(2500), durum: 'sifir' }
  } });
  assert.equal(price(app.card('legacy')), '1.500 ₺');
  for (const id of ['out', 'new-only', 'empty', 'unmapped', 'legacy-new']) {
    assert.equal(price(app.card(id)), '1.000 ₺');
    assert.doesNotMatch(app.card(id).innerHTML, /kt-stok-badge/);
  }
  assert.equal(price(app.card('new-only', 'sifir')), '2.400 ₺');
  assert.equal(price(app.card('legacy-new', 'sifir')), '2.500 ₺');
  assert.equal(app.cards().length, games.length + 2);
});

test('invalid prices fall back for 2.El only; unknown Sıfır prevents a numeric total/net', async () => {
  for (const value of [0, -10, null, undefined, NaN, Infinity, '2000']) {
    const app = await createApp([game()], { stock: { elden: variants(stocked(value), stocked(value)) } });
    assert.equal(price(app.card('elden')), '1.000 ₺');
    assert.equal(price(app.card('elden', 'sifir')), 'Sor');
    assert.match(app.singleMessage(app.card('elden', 'sifir')), /Fiyat sor/);
    app.select(app.card('elden'));
    app.select(app.card('elden', 'sifir'));
    app.mode('buy');
    app.select(app.card('elden'));
    assert.match(app.elements.ktBulkSell.textContent, /Fiyat sor/);
    assert.equal(app.elements.ktBulkNetVal.textContent, 'Fiyat sor');
    assert.match(app.bulkMessage(), /Sıfır — Fiyat sor/);
    assert.doesNotMatch(app.bulkMessage(), /Satış toplam: [\d]|Ödenecek fark: [\d]|Tam takas/);
  }
});

test('unknown catalog trade offers never count as zero in mixed selections', async () => {
  const app = await createApp([game('known'), game('unknown', { buy: null })], { stock: {} });
  app.select(app.card('known'));
  app.mode('buy');
  app.select(app.card('known'));
  app.select(app.card('unknown'));
  assert.match(app.elements.ktBulkBuy.textContent, /Fiyat sor/);
  assert.equal(app.elements.ktBulkNetVal.textContent, 'Fiyat sor');
  assert.match(app.bulkMessage(), /Takas toplam: Fiyat sor/);
  assert.doesNotMatch(app.bulkMessage(), /Ödenecek fark: 400|Tam takas/);
});

test('selection survives search/mode changes and selected-only view shows mixed entries exactly once', async () => {
  const app = await createApp([game(), game('other', { name: 'Other Game' })], {
    stock: { elden: variants(stocked(1400), stocked(2100)) }
  });
  app.select(app.card('elden'));
  app.select(app.card('elden', 'sifir'));
  app.search('no match');
  assert.equal(app.cards().length, 0);
  app.mode('buy');
  app.search('');
  assert.equal(app.card('elden').getAttribute('aria-pressed'), 'false');
  app.select(app.card('elden'));
  app.search('other');
  app.selectedOnly();
  assert.equal(app.cards().length, 3);
  assert.ok(app.cards().every(card => card.getAttribute('aria-pressed') === 'true'));
  assert.equal(app.card('elden', '2el', 'sell') && price(app.card('elden', '2el', 'sell')), '1.400 ₺');
  assert.equal(price(app.card('elden', '2el', 'buy')), '600 ₺');
  app.select(app.card('elden', 'sifir', 'sell'));
  assert.equal(app.cards().length, 2);
  assert.equal(app.elements.ktBulkSell.textContent, '1.400 ₺');
  app.selectedOnly();
  app.search('');
  app.mode('sell');
  assert.equal(app.card('elden').getAttribute('aria-pressed'), 'true');
  assert.equal(app.card('elden', 'sifir').getAttribute('aria-pressed'), 'false');
  assert.ok(app.card('other'));
  app.clear();
  assert.equal(app.elements.ktBulk.hidden, true);
  assert.ok(app.cards().every(card => card.getAttribute('aria-pressed') === 'false'));
});

test('stock badges/filter apply per sales variant and are ignored/hidden in trade mode', async () => {
  const app = await createApp([game(), game('other')], {
    stock: { elden: variants({ stokta: false, satis: 5000 }, stocked(2100)) }
  });
  app.stock('var');
  assert.equal(app.cards().length, 1);
  assert.equal(app.cards()[0].dataset.condition, 'sifir');
  app.mode('buy');
  assert.equal(app.stockTabs.hidden, true);
  assert.equal(app.cards().length, 2);
  assert.ok(app.cards().every(card => !card.innerHTML.includes('kt-stok-badge')));
  app.mode('sell');
  assert.equal(app.stockTabs.hidden, false);
  assert.equal(app.cards().length, 1);
  app.stock('yok');
  assert.equal(app.cards().length, 2);
  assert.ok(app.cards().every(card => card.dataset.condition === '2el'));
});

test('standard and special editions keep independent stock, prices and selections', async () => {
  const app = await createApp([
    game('standard'), game('deluxe', { name: 'Elden Ring Deluxe Edition', sell: 1800, buy: 1200 })
  ], { stock: { deluxe: variants(stocked(1900), stocked(2700)) } });
  app.search('elden ring');
  assert.equal(app.cards().length, 3);
  assert.equal(price(app.card('standard')), '1.000 ₺');
  assert.doesNotMatch(app.card('standard').innerHTML, /kt-stok-badge/);
  assert.equal(price(app.card('deluxe')), '1.900 ₺');
  app.select(app.card('deluxe'));
  assert.equal(app.card('standard').getAttribute('aria-pressed'), 'false');
  assert.equal(app.card('deluxe', 'sifir').getAttribute('aria-pressed'), 'false');
  assert.match(app.bulkMessage(), /Deluxe Edition — 2\.El — 1\.900 ₺/);
  app.mode('buy');
  assert.equal(price(app.card('deluxe')), '1.200 ₺');
});

test('Turkish dotted capitals, platform names, and unordered multiword AND search work', async () => {
  const app = await createApp([
    game('turkish', { name: 'İKİ Çılgın Şövalye', platform: 'ps4' }),
    game('switch', { name: 'Ring Adventure', platform: 'switch2' }), game()
  ], { stock: {} });
  for (const query of ['iki', 'ŞÖVALYE çılgın', 'playstation 4 iki', 'ps4 iki']) {
    app.search(query);
    assert.deepEqual(app.cards().map(card => card.dataset.id), ['turkish']);
  }
  app.search('ring nintendo 2');
  assert.deepEqual(app.cards().map(card => card.dataset.id), ['switch']);
  app.search('ps5 ring elden');
  assert.deepEqual(app.cards().map(card => card.dataset.id), ['elden']);
  app.search('ps5 elden absent');
  assert.equal(app.cards().length, 0);
});

test('catalog fields and URL attributes are escaped; unsafe image protocols are dropped', async () => {
  const hostileId = 'id"/><img src=x onerror=evil()>[x]';
  const app = await createApp([
    game(hostileId, { name: '<svg onload=evil()> "Game" & friends', image: 'https://example.com/a" onerror="evil()' }),
    game('unsafe', { image: 'javascript:alert(1)' }),
    game('data', { image: 'data:image/svg+xml,<svg onload=evil()>' }),
    game('platform', { platform: 'ps5" onmouseover="evil()' })
  ], { stock: {} });
  const html = app.elements.ktGrid.innerHTML;
  assert.doesNotMatch(html, /<svg|<img src=x|src="javascript:|src="data:|" onerror="|" onmouseover="/);
  assert.match(html, /&lt;svg onload=evil\(\)&gt;/);
  assert.match(html, /&quot;Game&quot; &amp; friends/);
  assert.ok(app.card(hostileId));
  app.select(app.card(hostileId));
  assert.equal(app.elements.ktBulkCount.textContent, 1);
  assert.match(app.singleMessage(app.card(hostileId)), /"Game" & friends/);
  assert.doesNotMatch(app.card('unsafe').innerHTML, /<img /);
  assert.doesNotMatch(app.card('data').innerHTML, /<img /);
});

test('pagination and focused selections survive inventory arrival and mode changes', async () => {
  const app = await createApp(Array.from({ length: 125 }, (_, i) => game('g' + i)));
  assert.equal(app.cards().length, 60);
  app.more();
  assert.equal(app.cards().length, 120);
  app.card('g70').focus();
  app.select(app.card('g70'));
  assert.equal(app.document.activeElement.dataset.id, 'g70');
  assert.equal(app.document.activeElement.getAttribute('aria-pressed'), 'true');
  await app.inventory({ g70: variants(stocked(1600), stocked(2300)) });
  assert.equal(app.cards().length, 120);
  assert.equal(app.card('g70').getAttribute('aria-pressed'), 'true');
  app.mode('buy');
  assert.equal(app.cards().length, 120);
  app.more();
  assert.equal(app.cards().length, 125);
  assert.equal(app.elements.ktMore.hidden, true);
});

test('inventory failures leave rendered catalog and existing selections usable', async () => {
  for (const kind of ['network', 'http', 'json']) {
    const app = await createApp([game()]);
    app.select(app.card('elden'));
    await app.failInventory(kind);
    assert.equal(price(app.card('elden')), '1.000 ₺');
    assert.equal(app.card('elden').getAttribute('aria-pressed'), 'true');
    assert.equal(app.elements.ktBulkSell.textContent, '1.000 ₺');
  }
});

test('503 means unknown stock: ignore its body, hide stock filtering and retain catalogue offers', async () => {
  const app = await createApp([game(), game('other')]);
  app.select(app.card('elden'));
  assert.equal(app.stockTabs.hidden, true);
  await app.failInventory('http');
  assert.equal(app.errorBodyReads(), 0);
  assert.equal(app.stockTabs.hidden, true);
  assert.equal(app.elements.ktStokStatus.hidden, false);
  assert.match(app.elements.ktStokStatus.textContent, /doğrulanamıyor/);
  app.stock('var');
  assert.equal(app.cards().length, 2);
  assert.equal(price(app.card('elden')), '1.000 ₺');
  assert.doesNotMatch(app.elements.ktGrid.innerHTML, /kt-stok-badge/);
  assert.match(app.bulkMessage(), /Satış toplam: 1\.000 ₺/);
  app.mode('buy');
  assert.equal(app.elements.ktStokStatus.hidden, true);
  assert.equal(price(app.card('elden')), '600 ₺');
});

test('invalid successful stock payloads also fall back to unknown stock', async () => {
  for (const value of [null, [], 'unavailable', false]) {
    const app = await createApp([game()], { stock: value });
    assert.equal(price(app.card('elden')), '1.000 ₺');
    assert.equal(app.stockTabs.hidden, true);
    assert.match(app.elements.ktStokStatus.textContent, /doğrulanamıyor/);
  }
});

test('keyboard activation of WhatsApp link never toggles the card selection', async () => {
  const app = await createApp([game()], { stock: {} });
  const card = app.card('elden');
  const link = { closest: selector => selector === '.kt-card-wa' ? link : card };
  const event = app.elements.ktGrid.fire('keydown', { key: 'Enter', target: link });
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(app.card('elden').getAttribute('aria-pressed'), 'false');
  app.elements.ktGrid.fire('keydown', { key: ' ', target: card });
  assert.equal(app.card('elden').getAttribute('aria-pressed'), 'true');
});
