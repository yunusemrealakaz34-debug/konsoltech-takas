/* KonsolTech — Oyun Takas Sistemi
   Arama + kategori + ÇOKLU SEÇİM + toplu fiyat.
   FİYAT MODU: Satış / Takas — aynı anda yalnızca biri gösterilir. */
(function () {
  "use strict";

  var WA = "https://wa.me/905454562041";
  var PAGE = 60;
  var state = {
    all: [], filtered: [], byId: Object.create(null),
    platform: "all", query: "", shown: 0, labels: {},
    mode: "sell",                      // "sell" = Satış, "buy" = Takas
    selected: Object.create(null), selCount: 0
  };

  var $ = function (s) { return document.querySelector(s); };
  var grid = $("#ktGrid"), empty = $("#ktEmpty"), countEl = $("#ktCount"),
      moreBtn = $("#ktMore"), searchEl = $("#ktSearch"), clearBtn = $("#ktClear"),
      tabs = $("#ktTabs"), modeEl = $("#ktMode"), legendEl = $("#ktLegend");
  var bulk = $("#ktBulk"), bulkCount = $("#ktBulkCount"),
      bulkSell = $("#ktBulkSell"), bulkBuy = $("#ktBulkBuy"),
      bulkWa = $("#ktBulkWa"), bulkClear = $("#ktBulkClear");

  var PLACE = { ps4: "PS4", ps5: "PS5", switch1: "Switch", switch2: "Switch 2" };
  var LEGEND = {
    sell: '<i class="bi bi-bag-check-fill"></i> Satış = oyunu bizden alma fiyatın',
    buy:  '<i class="bi bi-arrow-left-right"></i> Takas = oyununu bize verme değerin'
  };

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
  function priceOf(g) { return state.mode === "sell" ? g.sell : g.buy; }
  function modeLabel() { return state.mode === "sell" ? "Satış" : "Takas"; }

  function waSingle(g) {
    var v = priceOf(g);
    var msg = "Merhaba, " + PLACE[g.platform] + " - " + g.name +
      (v != null ? " (" + modeLabel() + " " + v.toLocaleString("tr-TR") + "₺)" : "") +
      " oyunuyla ilgileniyorum.";
    return WA + "?text=" + encodeURIComponent(msg);
  }

  function card(g) {
    var sel = state.selected[g.id] ? " is-selected" : "";
    var img = g.image
      ? '<img src="' + g.image + '" alt="' + g.name + '" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'no-img\')">'
      : "";
    var v = priceOf(g);
    var cls = state.mode === "sell" ? "kt-price-sell" : "kt-price-buy";
    var price = (v != null)
      ? '<div class="kt-price ' + cls + '"><span>' + modeLabel() + '</span><b>' + fmt(v) + '</b></div>'
      : '<div class="kt-price kt-price-ask"><span>' + modeLabel() + '</span><b>Sor</b></div>';

    return '<div class="kt-game-card' + (g.image ? "" : " no-img") + sel + '" data-id="' + g.id + '" role="button" tabindex="0" aria-pressed="' + (sel ? "true" : "false") + '">' +
      '<div class="kt-game-img">' + img +
        '<span class="kt-plat-badge kt-plat-' + g.platform + '">' + PLACE[g.platform] + '</span>' +
        '<span class="kt-select-tick" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
      '</div>' +
      '<div class="kt-game-body">' +
        '<h5 title="' + g.name + '">' + g.name + '</h5>' +
        '<div class="kt-price-row kt-price-single">' + price + '</div>' +
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
  // mod değişince yüklenmiş kartları yeniden çiz (seçim + sayfa korunur)
  function reRender() {
    var count = Math.max(state.shown, PAGE);
    grid.innerHTML = state.filtered.slice(0, count).map(card).join("");
  }

  /* ---------- FİYAT MODU ---------- */
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    [].forEach.call(modeEl.children, function (b) {
      var on = b.dataset.mode === m;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (legendEl) legendEl.innerHTML = LEGEND[m];
    reRender();
    updateBulk();
  }

  /* ---------- ÇOKLU SEÇİM ---------- */
  function toggleSelect(id, el) {
    var g = state.byId[id];
    if (!g) return;
    if (state.selected[id]) {
      delete state.selected[id]; state.selCount--;
      if (el) { el.classList.remove("is-selected"); el.setAttribute("aria-pressed", "false"); }
    } else {
      state.selected[id] = g; state.selCount++;
      if (el) { el.classList.add("is-selected"); el.setAttribute("aria-pressed", "true"); }
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
    // aktif moda göre yalnızca ilgili toplamı göster
    bulk.classList.toggle("kt-mode-sell", state.mode === "sell");
    bulk.classList.toggle("kt-mode-buy", state.mode === "buy");
    bulk.hidden = n === 0;
    document.body.classList.toggle("kt-has-bulk", n > 0);

    var active = state.mode === "sell" ? "Satış" : "Takas";
    var activeSum = state.mode === "sell" ? sellSum : buySum;
    var lines = ids.map(function (id) {
      var g = state.selected[id];
      var v = state.mode === "sell" ? g.sell : g.buy;
      return "• " + PLACE[g.platform] + " " + g.name + (typeof v === "number" ? " — " + active + " " + v.toLocaleString("tr-TR") + "₺" : "");
    });
    var msg = "Merhaba, şu oyunlarla ilgileniyorum (" + active + "):\n" + lines.join("\n") +
      "\n\n" + active + " toplam: " + activeSum.toLocaleString("tr-TR") + "₺";
    bulkWa.href = WA + "?text=" + encodeURIComponent(msg);
  }

  function clearSelection() {
    state.selected = Object.create(null); state.selCount = 0;
    [].forEach.call(grid.querySelectorAll(".kt-game-card.is-selected"), function (el) {
      el.classList.remove("is-selected"); el.setAttribute("aria-pressed", "false");
    });
    updateBulk();
  }

  /* ---------- olaylar ---------- */
  grid.addEventListener("click", function (e) {
    if (e.target.closest(".kt-card-wa")) return;
    var c = e.target.closest(".kt-game-card");
    if (c) toggleSelect(c.getAttribute("data-id"), c);
  });
  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var c = e.target.closest(".kt-game-card");
    if (c) { e.preventDefault(); toggleSelect(c.getAttribute("data-id"), c); }
  });
  if (bulkClear) bulkClear.addEventListener("click", clearSelection);
  if (modeEl) modeEl.addEventListener("click", function (e) {
    var b = e.target.closest(".kt-mode-btn");
    if (b) setMode(b.dataset.mode);
  });

  var t;
  function onSearch(v) {
    state.query = v; clearBtn.hidden = !v;
    clearTimeout(t); t = setTimeout(applyFilter, 120);
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

  /* ---------- veri ---------- */
  fetch("data/games.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.labels = data.platforms || {};
      state.all = (data.games || []).map(function (g) {
        g._n = normalize(g.name); state.byId[g.id] = g; return g;
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
