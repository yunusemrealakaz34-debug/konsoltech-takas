/* KonsolTech — Oyun Takas Sistemi
   data/games.json'u yükler, arama + kategori filtresi + kart render eder. */
(function () {
  "use strict";

  var WA = "https://wa.me/905454562041";
  var PAGE = 60;            // her seferde gösterilen kart sayısı
  var state = {
    all: [],
    filtered: [],
    platform: "all",
    query: "",
    shown: 0,
    labels: {}
  };

  var $ = function (s) { return document.querySelector(s); };
  var grid = $("#ktGrid"),
      empty = $("#ktEmpty"),
      countEl = $("#ktCount"),
      moreBtn = $("#ktMore"),
      searchEl = $("#ktSearch"),
      clearBtn = $("#ktClear"),
      tabs = $("#ktTabs");

  var PLACE = {
    ps4: "PS4", ps5: "PS5", switch1: "Switch", switch2: "Switch 2"
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

  function waLink(g) {
    var msg = "Merhaba, " + PLACE[g.platform] + " - " + g.name + " oyununu takas etmek/almak istiyorum.";
    return WA + "?text=" + encodeURIComponent(msg);
  }

  function card(g) {
    var img = g.image
      ? '<img src="' + g.image + '" alt="' + g.name + '" loading="lazy" onerror="this.parentNode.classList.add(\'no-img\')">'
      : "";
    var sell = fmt(g.sell), buy = fmt(g.buy);
    var prices = "";
    if (sell) prices += '<div class="kt-price kt-price-sell"><span>Satış</span><b>' + sell + '</b></div>';
    if (buy)  prices += '<div class="kt-price kt-price-buy"><span>Takas</span><b>' + buy + '</b></div>';
    if (!prices) prices = '<div class="kt-price kt-price-ask"><span>&nbsp;</span><b>Sor</b></div>';

    return '<a class="kt-game-card' + (g.image ? "" : " no-img") + '" href="' + waLink(g) + '" target="_blank" rel="noopener">' +
      '<div class="kt-game-img">' + img +
        '<span class="kt-plat-badge kt-plat-' + g.platform + '">' + PLACE[g.platform] + '</span>' +
      '</div>' +
      '<div class="kt-game-body">' +
        '<h5 title="' + g.name + '">' + g.name + '</h5>' +
        '<div class="kt-price-row">' + prices + '</div>' +
        '<span class="kt-game-cta"><i class="bi bi-whatsapp"></i> Takas Et</span>' +
      '</div></a>';
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
    var html = next.map(card).join("");
    grid.insertAdjacentHTML("beforeend", html);
    state.shown += next.length;
    moreBtn.hidden = state.shown >= state.filtered.length;
  }

  // debounce arama
  var t;
  function onSearch(v) {
    state.query = v;
    clearBtn.hidden = !v;
    clearTimeout(t);
    t = setTimeout(applyFilter, 120);
  }

  searchEl.addEventListener("input", function (e) { onSearch(e.target.value); });
  clearBtn.addEventListener("click", function () {
    searchEl.value = ""; onSearch(""); searchEl.focus();
  });
  moreBtn.addEventListener("click", render);
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest(".kt-tab");
    if (!b) return;
    state.platform = b.dataset.platform;
    [].forEach.call(tabs.children, function (x) { x.classList.toggle("is-active", x === b); });
    applyFilter();
  });

  // veri yükle
  fetch("data/games.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.labels = data.platforms || {};
      state.all = (data.games || []).map(function (g) {
        g._n = normalize(g.name);
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
