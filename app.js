/* KonsolTech — Oyun Takas Sistemi
   data/games.json'u yükler: arama + kategori filtresi + kart render
   + ÇOKLU SEÇİM ve toplu fiyat (Satış toplam / Takas toplam ayrı). */
(function () {
  "use strict";

  var WA = "https://wa.me/905454562041";
  var PAGE = 60;
  var state = {
    all: [],
    filtered: [],
    platform: "all",
    query: "",
    shown: 0,
    labels: {},
    selected: Object.create(null),  // id -> game
    selCount: 0
  };

  var $ = function (s) { return document.querySelector(s); };
  var grid = $("#ktGrid"),
      empty = $("#ktEmpty"),
      countEl = $("#ktCount"),
      moreBtn = $("#ktMore"),
      searchEl = $("#ktSearch"),
      clearBtn = $("#ktClear"),
      tabs = $("#ktTabs");

  // toplu seçim çubuğu öğeleri
  var bulk = $("#ktBulk"),
      bulkCount = $("#ktBulkCount"),
      bulkSell = $("#ktBulkSell"),
      bulkBuy = $("#ktBulkBuy"),
      bulkWa = $("#ktBulkWa"),
      bulkClear = $("#ktBulkClear");

  var PLACE = { ps4: "PS4", ps5: "PS5", switch1: "Switch", switch2: "Switch 2" };

  function fmt(n) {
    if (n === null || n === undefined) return null;
    return n.toLocaleString("tr-TR") + " ₺";
  }

  function normalize(s) {
    return (s || "").toLowerCase()
      .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ş/g, "s")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function waSingle(g) {
    var msg = "Merhaba, " + PLACE[g.platform] + " - " + g.name + " oyununu takas etmek/almak istiyorum.";
    return WA + "?text=" + encodeURIComponent(msg);
  }

  function card(g) {
    var sel = state.selected[g.id] ? " is-selected" : "";
    var img = g.image
      ? '<img src="' + g.image + '" alt="' + g.name + '" loading="lazy" onerror="this.parentNode.classList.add(\'no-img\')">'
      : "";
    var sell = fmt(g.sell), buy = fmt(g.buy);
    var prices = "";
    if (sell) prices += '<div class="kt-price kt-price-sell"><span>Satış</span><b>' + sell + '</b></div>';
    if (buy)  prices += '<div class="kt-price kt-price-buy"><span>Takas</span><b>' + buy + '</b></div>';
    if (!prices) prices = '<div class="kt-price kt-price-ask"><span>&nbsp;</span><b>Sor</b></div>';

    return '<div class="kt-game-card' + (g.image ? "" : " no-img") + sel + '" data-id="' + g.id + '" role="button" tabindex="0" aria-pressed="' + (sel ? "true" : "false") + '">' +
      '<div class="kt-game-img">' + img +
        '<span class="kt-plat-badge kt-plat-' + g.platform + '">' + PLACE[g.platform] + '</span>' +
        '<span class="kt-select-tick" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
      '</div>' +
      '<div class="kt-game-body">' +
        '<h5 title="' + g.name + '">' + g.name + '</h5>' +
        '<div class="kt-price-row">' + prices + '</div>' +
        '<div class="kt-card-foot">' +
          '<span class="kt-select-hint"><i class="bi bi-plus-lg"></i> Seç</span>' +
          '<a class="kt-card-wa" href="' + waSingle(g) + '" target="_blank" rel="noopener" title="Bu oyunu WhatsApp\'tan sor"><i class="bi bi-whatsapp"></i></a>' +
        '</div>' +
      '</div></div>';
  }

  function applyFilter() {
    var q = normalize(state.query);
    state.filtered = state.all.filter(function (g) {
      if (state.platform !== "all" && g.platform !== state.platform) return false;
      if (q && g._n.indexOf(q) === -1) return false;
      return true;
    });
    state.shown = 0;
    grid.innerHTML = "";
    render();
    countEl.textContent = state.filtered.length.toLocaleString("tr-TR") + " oyun listeleniyor";
    empty.hidden = state.filtered.length !== 0;
    grid.hidden = state.filtered.length === 0;
  }

  function render() {
    var next = state.filtered.slice(state.shown, state.shown + PAGE);
    grid.insertAdjacentHTML("beforeend", next.map(card).join(""));
    state.shown += next.length;
    moreBtn.hidden = state.shown >= state.filtered.length;
  }

  /* ---------- ÇOKLU SEÇİM ---------- */
  function toggleSelect(id, cardEl) {
    var g = state.byId[id];
    if (!g) return;
    if (state.selected[id]) {
      delete state.selected[id];
      state.selCount--;
      if (cardEl) { cardEl.classList.remove("is-selected"); cardEl.setAttribute("aria-pressed", "false"); }
    } else {
      state.selected[id] = g;
      state.selCount++;
      if (cardEl) { cardEl.classList.add("is-selected"); cardEl.setAttribute("aria-pressed", "true"); }
    }
    updateBulk();
  }

  function updateBulk() {
    var ids = Object.keys(state.selected);
    var n = ids.length, sellSum = 0, buySum = 0;
    ids.forEach(function (id) {
      var g = state.selected[id];
      if (typeof g.sell === "number") sellSum += g.sell;
      if (typeof g.buy === "number") buySum += g.buy;
    });
    bulkCount.textContent = n;
    bulkSell.textContent = sellSum.toLocaleString("tr-TR") + " ₺";
    bulkBuy.textContent = buySum.toLocaleString("tr-TR") + " ₺";
    bulk.hidden = n === 0;
    document.body.classList.toggle("kt-has-bulk", n > 0);

    // WhatsApp toplu mesaj
    var lines = ids.map(function (id) {
      var g = state.selected[id];
      var p = [];
      if (typeof g.sell === "number") p.push("Satış " + g.sell.toLocaleString("tr-TR") + "₺");
      if (typeof g.buy === "number") p.push("Takas " + g.buy.toLocaleString("tr-TR") + "₺");
      return "• " + PLACE[g.platform] + " " + g.name + (p.length ? " (" + p.join(" / ") + ")" : "");
    });
    var msg = "Merhaba, şu oyunları takas etmek/almak istiyorum:\n" + lines.join("\n") +
      "\n\nSatış toplam: " + sellSum.toLocaleString("tr-TR") + "₺" +
      "\nTakas toplam: " + buySum.toLocaleString("tr-TR") + "₺";
    bulkWa.href = WA + "?text=" + encodeURIComponent(msg);
  }

  function clearSelection() {
    state.selected = Object.create(null);
    state.selCount = 0;
    [].forEach.call(grid.querySelectorAll(".kt-game-card.is-selected"), function (el) {
      el.classList.remove("is-selected");
      el.setAttribute("aria-pressed", "false");
    });
    updateBulk();
  }

  // kart tıklaması = seçim (WA butonu hariç)
  grid.addEventListener("click", function (e) {
    if (e.target.closest(".kt-card-wa")) return;       // tek oyun WA linki
    var c = e.target.closest(".kt-game-card");
    if (!c) return;
    toggleSelect(c.getAttribute("data-id"), c);
  });
  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var c = e.target.closest(".kt-game-card");
    if (!c) return;
    e.preventDefault();
    toggleSelect(c.getAttribute("data-id"), c);
  });
  if (bulkClear) bulkClear.addEventListener("click", clearSelection);

  /* ---------- arama / filtre ---------- */
  var t;
  function onSearch(v) {
    state.query = v;
    clearBtn.hidden = !v;
    clearTimeout(t);
    t = setTimeout(applyFilter, 120);
  }
  searchEl.addEventListener("input", function (e) { onSearch(e.target.value); });
  clearBtn.addEventListener("click", function () { searchEl.value = ""; onSearch(""); searchEl.focus(); });
  moreBtn.addEventListener("click", render);
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest(".kt-tab");
    if (!b) return;
    state.platform = b.dataset.platform;
    [].forEach.call(tabs.children, function (x) { x.classList.toggle("is-active", x === b); });
    applyFilter();
  });

  /* ---------- veri yükle ---------- */
  fetch("data/games.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.labels = data.platforms || {};
      state.byId = Object.create(null);
      state.all = (data.games || []).map(function (g) {
        g._n = normalize(g.name);
        state.byId[g.id] = g;
        return g;
      });
      if (data.updatedAt) {
        var u = $("#ktUpdated");
        if (u) u.textContent = data.updatedAt.split(" ")[0] + " tarihinde";
      }
      applyFilter();
    })
    .catch(function (err) {
      countEl.textContent = "Liste yüklenemedi.";
      grid.innerHTML = '<div class="kt-empty" style="grid-column:1/-1">' +
        '<i class="bi bi-exclamation-triangle"></i><h4>Fiyat listesi yüklenemedi</h4>' +
        '<p>Lütfen sayfayı yenileyin veya WhatsApp\'tan bize ulaşın.</p>' +
        '<a href="' + WA + '" class="kt-btn-primary" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a></div>';
      console.error("games.json:", err);
    });
})();
