const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function decode(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => ({
    amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>'
  })[entity]);
}

class Element {
  constructor(document, attrs = {}, html = '') {
    this.document = document;
    this.attrs = attrs;
    this.html = html;
    this.hidden = false;
    this.textContent = '';
    this.children = [];
    this.listeners = {};
    this.dataset = Object.fromEntries(Object.entries(attrs)
      .filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5), value]));
    this.classList = {
      contains: name => (this.attrs.class || '').split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
        const on = force === undefined ? !names.has(name) : force;
        if (on) names.add(name); else names.delete(name);
        this.attrs.class = [...names].join(' ');
        return on;
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false)
    };
  }
  get innerHTML() { return this.html; }
  set innerHTML(html) { this.html = html; }
  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, event = {}) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const callback of this.listeners[name] || []) callback(event);
    return event;
  }
  closest(selector) {
    if (selector[0] === '.' && this.classList.contains(selector.slice(1))) return this;
    return this.parent?.closest(selector) || null;
  }
  focus() { this.document.activeElement = this; }
}

function attributes(html) {
  return Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)]
    .map(([, name, value]) => [name, decode(value)]));
}

class Grid extends Element {
  get innerHTML() { return this.html; }
  set innerHTML(html) {
    this.html = html;
    const starts = [...html.matchAll(/<div class="kt-game-card\b[^>]*>/g)];
    this.children = starts.map((match, index) => {
      const markup = html.slice(match.index, starts[index + 1]?.index ?? html.length);
      const card = new Element(this.document, attributes(match[0]), markup);
      card.parent = this;
      Object.defineProperty(card, 'outerHTML', {
        set: replacement => { this.innerHTML = this.html.replace(markup, replacement); }
      });
      return card;
    });
  }
  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') throw new Error('Unsupported insertion');
    this.innerHTML += html;
  }
  querySelectorAll(selector) {
    if (selector !== '.kt-game-card') throw new Error('Unsupported selector: ' + selector);
    return this.children;
  }
  querySelector(selector) {
    const match = selector.match(/^\.kt-game-card\[data-(id|key)="(.*)"\]$/);
    if (!match) throw new Error('Unsupported selector: ' + selector);
    return this.children.find(card => card.getAttribute('data-' + match[1]) === match[2]) || null;
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function createApp(games, options = {}) {
  const ids = [...fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
    .matchAll(/id="(kt\w+)"/g)].map(match => match[1]);
  const document = { activeElement: null };
  const elements = Object.fromEntries(ids.map(id => [id, new Element(document, { id })]));
  elements.ktGrid = new Grid(document, { id: 'ktGrid' });
  elements.ktGrid.innerHTML = '';
  const buttons = (values, kind, cls) => values.map(value =>
    new Element(document, { ['data-' + kind]: value, class: cls }));
  elements.ktMode.children = buttons(['sell', 'buy'], 'mode', 'kt-mode-btn');
  elements.ktTabs.children = buttons(['all', 'ps4', 'ps5', 'switch1', 'switch2'], 'platform', 'kt-tab');
  const stockButtons = buttons(['all', 'var', 'yok'], 'stok', 'kt-stok-btn');
  const stockTabs = elements.ktStokTabs || new Element(document, { class: 'kt-stok-tabs' });
  document.body = new Element(document);
  document.querySelector = selector => selector === '.kt-stok-tabs' ? stockTabs : elements[selector.slice(1)] || null;
  document.querySelectorAll = selector => {
    if (selector === '.kt-stok-btn') return stockButtons;
    throw new Error('Unsupported document selector: ' + selector);
  };
  const inventory = deferred();
  let errorBodyReads = 0;
  const timers = new Map();
  const requests = [];
  let nextTimer = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), {
    document, URL, console: { error() {} },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    fetch: url => {
      requests.push(url);
      if (url === 'data/games.json') return Promise.resolve({ ok: true, json: () => Promise.resolve({
        games, platforms: { ps4: 'PlayStation 4', ps5: 'PlayStation 5', switch1: 'Nintendo Switch', switch2: 'Nintendo Switch 2' }
      }) });
      if (url === 'https://app.konsoltech.tr/api/takas-stok.json') return inventory.promise;
      throw new Error('Unexpected fetch: ' + url);
    }
  }, { filename: 'app.js' });
  await flush();
  const app = {
    elements, document, requests, stockTabs,
    cards: () => elements.ktGrid.children,
    card: (id, condition = '2el', mode) => elements.ktGrid.children.find(card =>
      card.dataset.id === id && (card.dataset.condition || '2el') === condition && (!mode || card.dataset.mode === mode)),
    select(card) {
      if (!card) throw new Error('Card missing');
      elements.ktGrid.fire('click', { target: card });
    },
    mode: value => elements.ktMode.fire('click', { target: elements.ktMode.children.find(button => button.dataset.mode === value) }),
    stock: value => stockButtons.find(button => button.dataset.stok === value).fire('click'),
    platform: value => elements.ktTabs.fire('click', { target: elements.ktTabs.children.find(button => button.dataset.platform === value) }),
    search(value) {
      elements.ktSearch.value = value;
      elements.ktSearch.fire('input', { target: elements.ktSearch });
      for (const [id, callback] of timers) { timers.delete(id); callback(); }
    },
    selectedOnly: () => elements.ktBulkView.fire('click'),
    clear: () => elements.ktBulkClear.fire('click'),
    more: () => elements.ktMore.fire('click'),
    bulkMessage: () => new URL(elements.ktBulkWa.href).searchParams.get('text'),
    singleMessage(card) {
      const href = card.innerHTML.match(/class="kt-card-wa" href="([^"]*)"/)[1];
      return new URL(decode(href)).searchParams.get('text');
    },
    async inventory(data) {
      inventory.resolve({ ok: true, json: () => Promise.resolve(data) });
      await flush();
    },
    async failInventory(kind) {
      if (kind === 'http') inventory.resolve({ ok: false, status: 503, json: () => {
        errorBodyReads++;
        return Promise.resolve({ elden: { stokta: true, satis: 9999 } });
      } });
      else if (kind === 'json') inventory.resolve({ ok: true, json: () => Promise.reject(new Error('Invalid JSON')) });
      else inventory.reject(new Error('Offline'));
      await flush();
    },
    errorBodyReads: () => errorBodyReads
  };
  if (Object.hasOwn(options, 'stock')) await app.inventory(options.stock);
  return app;
}

module.exports = { createApp };
