/* KonsolTech — Oyun Takas Sistemi
   Arama + kategori + ÇOKLU SEÇİM + toplu fiyat.
   FİYAT MODU: Satış / Takas — aynı anda yalnızca biri gösterilir. */
(function () {
  "use strict";

  var WA = "https://wa.me/905454562041";
  var PAGE = 60;
  var state = {
    all: [], filtered: [], rowsByKey: Object.create(null),
    platform: "all", query: "", shown: 0, labels: {},
    mode: "sell",                      // "sell" = Satış, "buy" = Takas
    selected: Object.create(null),
    showOnlySel: false,
    stok: Object.create(null),         // TM: games_id -> {stokta, satis, durum, varyantlar}
    stokStatus: "loading",            // "loading" | "ready" | "unknown"
    stokFilter: "all"                  // "all" | "var" | "yok"
  };

  var $ = function (s) { return document.querySelector(s); };
  var grid = $("#ktGrid"), empty = $("#ktEmpty"), countEl = $("#ktCount"),
      moreBtn = $("#ktMore"), searchEl = $("#ktSearch"), clearBtn = $("#ktClear"),
      tabs = $("#ktTabs"), modeEl = $("#ktMode"), legendEl = $("#ktLegend");
  var bulk = $("#ktBulk"), bulkCount = $("#ktBulkCount"),
      bulkSell = $("#ktBulkSell"), bulkBuy = $("#ktBulkBuy"),
      bulkWa = $("#ktBulkWa"), bulkClear = $("#ktBulkClear"),
      bulkView = $("#ktBulkView");
  var stokBtns = document.querySelectorAll(".kt-stok-btn");
  var stokTabs = $("#ktStokTabs"), stokStatusEl = $("#ktStokStatus");
  var bulkSellBox = $("#ktBulkSellBox"), bulkBuyBox = $("#ktBulkBuyBox"),
      bulkSellLbl = $("#ktBulkSellLbl"), bulkBuyLbl = $("#ktBulkBuyLbl"),
      bulkNet = $("#ktBulkNet"), bulkNetLbl = $("#ktBulkNetLbl"), bulkNetVal = $("#ktBulkNetVal");

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
    return String(s == null ? "" : s).replace(/İ/g, "I").toLowerCase()
      .replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function imageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      var url = new URL(value, "https://takas.konsoltech.tr/");
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) { return ""; }
  }
  function positivePrice(value) {
    return typeof value === "number" && isFinite(value) && value > 0 ? value : null;
  }
  function stockOf(g, condition) {
    var s = state.stok[g.id];
    if (!s || typeof s !== "object") return null;
    // Varyant haritası varsa üst düzey özet diğer durumun yerine kullanılamaz.
    if (Object.prototype.hasOwnProperty.call(s, "varyantlar")) {
      return s.varyantlar && s.varyantlar[condition] || null;
    }
    // Eski, durumsuz API kayıtları 2.El kataloğuna aittir.
    return (s.durum || "2el") === condition ? s : null;
  }
  function inStock(row) {
    var stock = stockOf(row.g, row.condition);
    return row.mode === "sell" && !!stock && stock.stokta === true;
  }
  function priceOf(row) {
    // Takas değeri yalnızca müşteriye açık katalog teklifidir.
    if (row.mode === "buy") return positivePrice(row.g.buy);
    var stock = stockOf(row.g, row.condition);
    var livePrice = inStock(row) ? positivePrice(stock.satis) : null;
    if (livePrice !== null) return livePrice;
    return row.condition === "2el" ? positivePrice(row.g.sell) : null;
  }
  function modeLabel(mode) { return mode === "sell" ? "Satış" : "Takas"; }
  function conditionLabel(condition) { return condition === "sifir" ? "Sıfır" : "2.El"; }
  function platformLabel(g) { return PLACE[g.platform] || state.labels[g.platform] || g.platform; }
  function selKey(mode, id, condition) { return mode + "|" + condition + "|" + id; }
  function viewOf(g, mode, condition) {
    return { g: g, mode: mode, condition: condition, key: selKey(mode, g.id, condition) };
  }

  function waSingle(row) {
    var g = row.g, v = priceOf(row);
    var msg = "Merhaba, " + platformLabel(g) + " - " + g.name + " - " + conditionLabel(row.condition) +
      " (" + modeLabel(row.mode) + " " + (v !== null ? fmt(v) : "Fiyat sor") + ")" +
      " oyunuyla ilgileniyorum.";
    return WA + "?text=" + encodeURIComponent(msg);
  }

  function card(row) {
    var g = row.g, mode = row.mode;
    var entry = state.selected[row.key];
    var sel = entry ? " is-selected is-sel-" + mode : "";
    var cover = imageUrl(g.image);
    var img = cover
      ? '<img src="' + escapeHtml(cover) + '" alt="' + escapeHtml(g.name) + '" loading="lazy" decoding="async" width="420" height="236">'
      : "";
    var v = priceOf(row);
    var stokVar = inStock(row);
    var stokRozet = stokVar ? '<span class="kt-stok-badge">✅ Stokta</span>' : '';
    var cls = mode === "sell" ? "kt-price-sell" : "kt-price-buy";
    var price = (v != null)
      ? '<div class="kt-price ' + cls + '"><span>' + modeLabel(mode) + '</span><b>' + fmt(v) + '</b></div>'
      : '<div class="kt-price kt-price-ask"><span>' + modeLabel(mode) + '</span><b>Sor</b></div>';
    var tag = entry
      ? '<span class="kt-sel-tag kt-sel-tag-' + mode + '">' +
          (mode === "sell"
            ? '<i class="bi bi-bag-check-fill"></i> Alıyorsun'
            : '<i class="bi bi-arrow-left-right"></i> Veriyorsun') +
        '</span>'
      : "";

    var platformClass = Object.prototype.hasOwnProperty.call(PLACE, g.platform) ? g.platform : "unknown";
    return '<div class="kt-game-card' + (cover ? "" : " no-img") + sel + '" data-id="' + escapeHtml(g.id) +
      '" data-key="' + escapeHtml(row.key) + '" data-mode="' + mode + '" data-condition="' + row.condition +
      '" role="button" tabindex="0" aria-pressed="' + (entry ? "true" : "false") + '">' +
      '<div class="kt-game-img">' + img +
        '<span class="kt-plat-badge kt-plat-' + platformClass + '">' + escapeHtml(platformLabel(g)) + '</span>' +
        '<span class="kt-select-tick" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
        tag +
      '</div>' +
      '<div class="kt-game-body">' +
        '<div class="kt-game-badges"><span class="kt-condition-badge kt-condition-' + row.condition + '">' +
          conditionLabel(row.condition) + '</span>' + stokRozet + '</div>' +
        '<h5 title="' + escapeHtml(g.name) + '">' + escapeHtml(g.name) + '</h5>' +
        '<div class="kt-price-row kt-price-single">' + price + '</div>' +
        '<div class="kt-card-foot">' +
          '<span class="kt-select-hint"><i class="bi bi-plus-lg"></i> Seç</span>' +
          '<a class="kt-card-wa" href="' + escapeHtml(waSingle(row)) + '" target="_blank" rel="noopener" title="Bu oyunu WhatsApp\'tan sor"><i class="bi bi-whatsapp"></i></a>' +
        '</div>' +
      '</div></div>';
  }

  function applyFilter(preservePage) {
    var count = preservePage === true ? Math.max(state.shown, PAGE) : PAGE;
    var q = normalize(state.query), terms = q ? q.split(" ") : [];
    if (state.showOnlySel) {
      // Her satır kendi modunu/durumunu taşır; karma seçimler ayrı kartlardır.
      state.filtered = Object.keys(state.selected).map(function (key) { return state.selected[key]; });
      countEl.textContent = state.filtered.length.toLocaleString("tr-TR") + " seçili oyun";
    } else {
      var rows = [];
      state.all.forEach(function (g) {
        rows.push(viewOf(g, state.mode, "2el"));
        var fresh = viewOf(g, "sell", "sifir");
        if (state.mode === "sell" && inStock(fresh)) rows.push(fresh);
      });
      state.filtered = rows.filter(function (row) {
        var g = row.g;
        if (state.platform !== "all" && g.platform !== state.platform) return false;
        if (!terms.every(function (term) { return g._n.indexOf(term) !== -1; })) return false;
        if (row.mode === "sell" && state.stokStatus === "ready") {
          if (state.stokFilter === "var" && !inStock(row)) return false;
          if (state.stokFilter === "yok" && inStock(row)) return false;
        }
        return true;
      });
      countEl.textContent = state.filtered.length.toLocaleString("tr-TR") + " oyun listeleniyor";
    }
    state.rowsByKey = Object.create(null);
    state.filtered.forEach(function (row) { state.rowsByKey[row.key] = row; });
    if (stokTabs) stokTabs.hidden = state.mode !== "sell" || state.stokStatus !== "ready" || state.showOnlySel;
    if (stokStatusEl) {
      stokStatusEl.hidden = state.mode !== "sell" || state.stokStatus === "ready" || state.showOnlySel;
      stokStatusEl.textContent = state.stokStatus === "loading"
        ? "Stok bilgisi kontrol ediliyor…" : "Stok bilgisi şu an doğrulanamıyor.";
    }
    if (legendEl) legendEl.innerHTML = state.showOnlySel
      ? "Alıyorsun = Satış · Veriyorsun = Takas" : LEGEND[state.mode];
    state.shown = 0;
    grid.innerHTML = "";
    render(count);
    empty.hidden = state.filtered.length !== 0;
    grid.hidden = state.filtered.length === 0;
  }
  function render(amount) {
    var next = state.filtered.slice(state.shown, state.shown + (typeof amount === "number" ? amount : PAGE));
    grid.insertAdjacentHTML("beforeend", next.map(card).join(""));
    state.shown += next.length;
    moreBtn.hidden = state.shown >= state.filtered.length;
  }

  /* ---------- FİYAT MODU ---------- */
  function setMode(m) {
    if ((m !== "sell" && m !== "buy") || m === state.mode) return;
    state.mode = m;
    [].forEach.call(modeEl.children, function (b) {
      var on = b.dataset.mode === m;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    applyFilter(true);
    updateBulk();
  }

  /* ---------- ÇOKLU SEÇİM ---------- */
  // Her seçim, seçildiği AN'daki moda göre etiketlenir:
  //   mode "sell" = müşteri bizden alıyor  → Satış toplamına (ödediği) girer
  //   mode "buy"  = müşteri bize veriyor    → Takas toplamına (aldığı) girer
  function toggleSelect(key) {
    var row = state.rowsByKey[key];
    if (!row) return;
    if (state.selected[key]) {
      delete state.selected[key];
    } else {
      state.selected[key] = row;
    }
    var wasFiltered = state.showOnlySel;
    updateBulk();
    if (wasFiltered) {
      applyFilter();
    } else {
      refreshCard(row);
    }
  }

  // Tek kartı yeniden çiz (etiket + seçim durumu güncellensin), klavye odağını koru.
  function findCard(key) {
    var cards = grid.querySelectorAll(".kt-game-card");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-key") === key) return cards[i];
    }
    return null;
  }
  function refreshCard(row) {
    var el = findCard(row.key);
    if (!el) return;
    var hadFocus = document.activeElement === el;
    el.outerHTML = card(row);
    if (hadFocus) {
      var nu = findCard(row.key);
      if (nu) nu.focus();
    }
  }

  function selectionTotals(keys) {
    var totals = { sell: { sum: 0, count: 0, unknown: 0 }, buy: { sum: 0, count: 0, unknown: 0 } };
    keys.forEach(function (key) {
      var row = state.selected[key], total = totals[row.mode], price = priceOf(row);
      total.count++;
      if (price === null) total.unknown++;
      else total.sum += price;
    });
    return totals;
  }
  function totalText(total) {
    return total.unknown ? "Fiyat sor · " + total.unknown + " oyun" : fmt(total.sum);
  }

  function updateBulk() {
    var keys = Object.keys(state.selected);
    var totals = selectionTotals(keys), n = keys.length;
    var nSell = totals.sell.count, nBuy = totals.buy.count;
    var incomplete = totals.sell.unknown || totals.buy.unknown;

    bulkCount.textContent = n;
    bulkSell.textContent = totalText(totals.sell);
    bulkBuy.textContent = totalText(totals.buy);
    if (bulkSellLbl) bulkSellLbl.textContent = nSell ? ("Alıyorsun · " + nSell) : "Alıyorsun";
    if (bulkBuyLbl)  bulkBuyLbl.textContent  = nBuy  ? ("Veriyorsun · " + nBuy) : "Veriyorsun";
    if (bulkSellBox) bulkSellBox.classList.toggle("is-empty", nSell === 0);
    if (bulkBuyBox)  bulkBuyBox.classList.toggle("is-empty", nBuy === 0);

    // NET FARK — yalnızca her iki tarafta da seçim varsa göster
    var net = incomplete ? null : totals.sell.sum - totals.buy.sum;
    if (bulkNet) {
      if (nSell && nBuy) {
        bulkNet.hidden = false;
        if (net === null) {
          bulkNet.className = "kt-bulk-net is-unknown";
          bulkNetLbl.textContent = "Net fark";
          bulkNetVal.textContent = "Fiyat sor";
        } else if (net > 0) {
          bulkNet.className = "kt-bulk-net is-pay";
          bulkNetLbl.textContent = "Ödenecek fark";
          bulkNetVal.textContent = net.toLocaleString("tr-TR") + " ₺";
        } else if (net < 0) {
          bulkNet.className = "kt-bulk-net is-credit";
          bulkNetLbl.textContent = "Sana ödenecek";
          bulkNetVal.textContent = Math.abs(net).toLocaleString("tr-TR") + " ₺";
        } else {
          bulkNet.className = "kt-bulk-net is-even";
          bulkNetLbl.textContent = "Tam takas";
          bulkNetVal.textContent = "Fark yok";
        }
      } else {
        bulkNet.hidden = true;
      }
    }

    if (n === 0 && state.showOnlySel) {
      state.showOnlySel = false;
      if (bulkView) { bulkView.classList.remove("is-active"); bulkView.innerHTML = '<i class="bi bi-check2-square"></i> Seçilenleri Gör'; }
    }
    bulk.hidden = n === 0;
    document.body.classList.toggle("kt-has-bulk", n > 0);

    bulkWa.href = WA + "?text=" + encodeURIComponent(buildWaMsg(keys, totals, net));
  }

  // WhatsApp mesajı: aldıkların + verdiklerin + net fark
  function buildWaMsg(keys, totals, net) {
    var buy = [], give = [];
    keys.forEach(function (k) {
      var e = state.selected[k], g = e.g, value = priceOf(e);
      var line = "• " + platformLabel(g) + " " + g.name + " — " + conditionLabel(e.condition) +
        " — " + (value !== null ? fmt(value) : "Fiyat sor");
      if (e.mode === "sell") {
        buy.push(line);
      } else {
        give.push(line);
      }
    });
    var parts = ["Merhaba, takas hesabım:"];
    if (buy.length) {
      parts.push("\nALDIKLARIM (Satış):\n" + buy.join("\n") +
        "\nSatış toplam: " + totalText(totals.sell));
    }
    if (give.length) {
      parts.push("\nVERDİKLERİM (Takas):\n" + give.join("\n") +
        "\nTakas toplam: " + totalText(totals.buy));
    }
    if (totals.sell.count && totals.buy.count) {
      if (net === null) parts.push("\nNet fark: Fiyat sor — fiyatlar tamamlanınca hesaplanacak.");
      else if (net > 0) parts.push("\nÖdenecek fark: " + fmt(net));
      else if (net < 0) parts.push("\nBana ödenecek: " + fmt(Math.abs(net)));
      else parts.push("\nTam takas — fark yok.");
    }
    return parts.join("\n");
  }

  function clearSelection() {
    state.selected = Object.create(null);
    state.showOnlySel = false;
    if (bulkView) { bulkView.classList.remove("is-active"); bulkView.innerHTML = '<i class="bi bi-check2-square"></i> Seçilenleri Gör'; }
    applyFilter();
    updateBulk();
  }

  function toggleView() {
    state.showOnlySel = !state.showOnlySel;
    bulkView.classList.toggle("is-active", state.showOnlySel);
    bulkView.innerHTML = state.showOnlySel
      ? '<i class="bi bi-grid-3x3-gap-fill"></i> Tümünü Gör'
      : '<i class="bi bi-check2-square"></i> Seçilenleri Gör';
    applyFilter();
  }

  /* ---------- olaylar ---------- */
  // Kapak yüklenemezse kartı no-img'e çevir (error bubble etmez, capture ile yakala)
  grid.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG") return;
    var c = t.closest(".kt-game-card");
    if (c) c.classList.add("no-img");
    t.remove();
  }, true);

  grid.addEventListener("click", function (e) {
    if (e.target.closest(".kt-card-wa")) return;
    var c = e.target.closest(".kt-game-card");
    if (c) toggleSelect(c.getAttribute("data-key"));
  });
  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(".kt-card-wa")) return;
    var c = e.target.closest(".kt-game-card");
    if (c) { e.preventDefault(); toggleSelect(c.getAttribute("data-key")); }
  });
  if (bulkClear) bulkClear.addEventListener("click", clearSelection);
  if (bulkView) bulkView.addEventListener("click", toggleView);
  [].forEach.call(stokBtns, function (btn) {
    btn.addEventListener("click", function () {
      if (state.mode !== "sell" || state.stokStatus !== "ready" || state.showOnlySel) return;
      state.stokFilter = btn.dataset.stok;
      [].forEach.call(stokBtns, function (b) { b.classList.toggle("is-active", b === btn); });
      applyFilter();
    });
  });
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
        g._n = normalize([g.name, g.platform, platformLabel(g), state.labels[g.platform]].join(" "));
        return g;
      });
      if (data.updatedAt) {
        var u = $("#ktUpdated");
        if (u) u.textContent = data.updatedAt.split(" ")[0] + " tarihinde";
      }
      applyFilter();
      // TM canlı stok durumu (opsiyonel — erişilemezse site normal çalışır)
      fetch("https://app.konsoltech.tr/api/takas-stok.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (stok) {
          if (!stok || typeof stok !== "object" || Array.isArray(stok)) throw new Error("Geçersiz stok yanıtı");
          state.stok = stok;
          state.stokStatus = "ready";
          applyFilter(true);
          updateBulk();
        })
        .catch(function () {
          state.stok = Object.create(null);
          state.stokStatus = "unknown";
          applyFilter(true);
          updateBulk();
        });
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
