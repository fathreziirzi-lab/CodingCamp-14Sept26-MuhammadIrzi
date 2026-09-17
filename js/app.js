/* ---------------------------------------------------
   Ledger — Expense & Budget Visualizer
   Vanilla JS, localStorage only, no frameworks
--------------------------------------------------- */

(function () {
  "use strict";

  var STORAGE_KEY = "ledger.transactions";
  var CATEGORIES_KEY = "ledger.categories";
  var THEME_KEY = "ledger.theme";

  var DEFAULT_CATEGORIES = ["Food", "Transport", "Fun"];

  // Color assigned per category, cycling through this palette for custom ones.
  var PALETTE = [
    { name: "Food", color: "#B8912F" },
    { name: "Transport", color: "#6E5A8C" },
    { name: "Fun", color: "#2F6B57" }
  ];
  var EXTRA_COLORS = ["#C1553D", "#3E7CB1", "#8C6E4E", "#5B8C6E", "#A85C8C"];

  var state = {
    transactions: [],
    categories: DEFAULT_CATEGORIES.slice(),
    sort: "newest"
  };

  var chart = null; // kept for compatibility, unused after SVG migration

  // ---------- DOM references ----------
  var el = {
    form: document.getElementById("txForm"),
    itemName: document.getElementById("itemName"),
    itemAmount: document.getElementById("itemAmount"),
    itemCategory: document.getElementById("itemCategory"),
    customWrap: document.getElementById("customCategoryWrap"),
    customCategory: document.getElementById("customCategory"),
    addCategoryBtn: document.getElementById("addCategoryBtn"),
    balanceAmount: document.getElementById("balanceAmount"),
    balanceCount: document.getElementById("balanceCount"),
    txList: document.getElementById("txList"),
    txEmpty: document.getElementById("txEmpty"),
    sortSelect: document.getElementById("sortSelect"),
    legend: document.getElementById("legend"),
    chartCanvas: document.getElementById("spendChart"),
    chartEmpty: document.getElementById("chartEmpty"),
    themeToggle: document.getElementById("themeToggle")
  };

  // ---------- Storage helpers ----------
  function load() {
    try {
      var rawTx = window.localStorage.getItem(STORAGE_KEY);
      state.transactions = rawTx ? JSON.parse(rawTx) : [];
    } catch (e) {
      state.transactions = [];
    }
    try {
      var rawCat = window.localStorage.getItem(CATEGORIES_KEY);
      state.categories = rawCat ? JSON.parse(rawCat) : DEFAULT_CATEGORIES.slice();
    } catch (e) {
      state.categories = DEFAULT_CATEGORIES.slice();
    }
  }

  function saveTransactions() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    } catch (e) {
      console.error("Could not save transactions", e);
    }
  }

  function saveCategories() {
    try {
      window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(state.categories));
    } catch (e) {
      console.error("Could not save categories", e);
    }
  }

  // ---------- Category colors ----------
  function colorFor(category) {
    for (var i = 0; i < PALETTE.length; i++) {
      if (PALETTE[i].name === category) return PALETTE[i].color;
    }
    var idx = state.categories.indexOf(category) % EXTRA_COLORS.length;
    if (idx < 0) idx = 0;
    return EXTRA_COLORS[idx];
  }

  // ---------- Category select rendering ----------
  function renderCategoryOptions() {
    var current = el.itemCategory.value;
    el.itemCategory.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose…";
    placeholder.disabled = true;
    el.itemCategory.appendChild(placeholder);

    state.categories.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      el.itemCategory.appendChild(opt);
    });

    if (current && state.categories.indexOf(current) !== -1) {
      el.itemCategory.value = current;
    } else {
      placeholder.selected = true;
    }
  }

  // ---------- Validation ----------
  function clearErrors() {
    ["itemName", "itemAmount", "itemCategory", "customCategory"].forEach(function (id) {
      var errEl = document.getElementById("err-" + id);
      if (errEl) errEl.textContent = "";
      var fieldEl = document.getElementById(id);
      if (fieldEl) fieldEl.closest(".field").classList.remove("field--invalid");
    });
  }

  function setError(id, message) {
    var errEl = document.getElementById("err-" + id);
    if (errEl) errEl.textContent = message;
    var fieldEl = document.getElementById(id);
    if (fieldEl) fieldEl.closest(".field").classList.add("field--invalid");
  }

  function validate(showingCustom) {
    clearErrors();
    var valid = true;

    var name = el.itemName.value.trim();
    if (!name) {
      setError("itemName", "Enter an item name.");
      valid = false;
    }

    var amountRaw = el.itemAmount.value.trim();
    var amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount) || amount <= 0) {
      setError("itemAmount", "Enter an amount greater than 0.");
      valid = false;
    }

    var category = el.itemCategory.value;
    if (!category) {
      setError("itemCategory", "Choose a category.");
      valid = false;
    }

    if (showingCustom) {
      var customName = el.customCategory.value.trim();
      if (!customName) {
        setError("customCategory", "Enter a name for the new category.");
        valid = false;
      }
    }

    return valid;
  }

  // ---------- Custom category flow ----------
  var addingCustom = false;

  el.addCategoryBtn.addEventListener("click", function () {
    addingCustom = !addingCustom;
    el.customWrap.hidden = !addingCustom;
    el.addCategoryBtn.textContent = addingCustom ? "− Cancel custom category" : "+ Add custom category";
    if (addingCustom) {
      el.customCategory.focus();
    }
  });

  // ---------- Form submit ----------
  el.form.addEventListener("submit", function (evt) {
    evt.preventDefault();

    if (!validate(addingCustom)) return;

    var category = el.itemCategory.value;

    if (addingCustom) {
      var customName = el.customCategory.value.trim();
      if (state.categories.indexOf(customName) === -1) {
        state.categories.push(customName);
        saveCategories();
      }
      category = customName;
    }

    var tx = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: el.itemName.value.trim(),
      amount: parseFloat(el.itemAmount.value),
      category: category,
      createdAt: Date.now()
    };

    state.transactions.push(tx);
    saveTransactions();

    el.form.reset();
    addingCustom = false;
    el.customWrap.hidden = true;
    el.addCategoryBtn.textContent = "+ Add custom category";
    renderCategoryOptions();
    clearErrors();

    renderAll();
  });

  // ---------- Delete ----------
  function deleteTransaction(id) {
    state.transactions = state.transactions.filter(function (t) {
      return t.id !== id;
    });
    saveTransactions();
    renderAll();
  }

  // ---------- Sorting ----------
  function sortedTransactions() {
    var list = state.transactions.slice();
    switch (state.sort) {
      case "oldest":
        list.sort(function (a, b) { return a.createdAt - b.createdAt; });
        break;
      case "amount-desc":
        list.sort(function (a, b) { return b.amount - a.amount; });
        break;
      case "amount-asc":
        list.sort(function (a, b) { return a.amount - b.amount; });
        break;
      case "category":
        list.sort(function (a, b) { return a.category.localeCompare(b.category); });
        break;
      case "newest":
      default:
        list.sort(function (a, b) { return b.createdAt - a.createdAt; });
        break;
    }
    return list;
  }

  el.sortSelect.addEventListener("change", function () {
    state.sort = el.sortSelect.value;
    renderList();
  });

  // ---------- Formatting ----------
  function formatMoney(n) {
    return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------- Rendering: balance ----------
  function renderBalance() {
    var total = state.transactions.reduce(function (sum, t) { return sum + t.amount; }, 0);
    el.balanceAmount.textContent = formatMoney(total);
    el.balanceCount.textContent = state.transactions.length + (state.transactions.length === 1 ? " transaction" : " transactions");
  }

  // ---------- Rendering: list ----------
  var trashSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M9 7V4.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8V7M6 7l1 12.2c0 .9.7 1.8 1.7 1.8h6.6c1 0 1.7-.9 1.7-1.8L18 7"/></svg>';

  function renderList() {
    var list = sortedTransactions();
    el.txList.innerHTML = "";

    el.txEmpty.hidden = list.length !== 0;

    list.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "tx-row";

      var dot = document.createElement("span");
      dot.className = "tx-row__dot";
      dot.style.background = colorFor(t.category);

      var main = document.createElement("div");
      main.className = "tx-row__main";

      var nameEl = document.createElement("span");
      nameEl.className = "tx-row__name";
      nameEl.textContent = t.name;

      var catEl = document.createElement("span");
      catEl.className = "tx-row__category";
      catEl.textContent = t.category;

      main.appendChild(nameEl);
      main.appendChild(catEl);

      var amountEl = document.createElement("span");
      amountEl.className = "tx-row__amount";
      amountEl.textContent = formatMoney(t.amount);

      var delBtn = document.createElement("button");
      delBtn.className = "tx-row__delete";
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "Delete " + t.name);
      delBtn.innerHTML = trashSvg;
      delBtn.addEventListener("click", function () { deleteTransaction(t.id); });

      li.appendChild(dot);
      li.appendChild(main);
      li.appendChild(amountEl);
      li.appendChild(delBtn);

      el.txList.appendChild(li);
    });
  }

  // ---------- Rendering: chart (SVG pie, no external library) ----------
  function categoryTotals() {
    var totals = {};
    state.transactions.forEach(function (t) {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return totals;
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  function svgSlicePath(cx, cy, r, startAngle, endAngle) {
    // If slice is a full circle, nudge slightly to avoid degenerate path
    if (endAngle - startAngle >= 360) endAngle = startAngle + 359.999;
    var start = polarToCartesian(cx, cy, r, startAngle);
    var end   = polarToCartesian(cx, cy, r, endAngle);
    var large = (endAngle - startAngle) > 180 ? 1 : 0;
    return [
      "M", cx, cy,
      "L", start.x, start.y,
      "A", r, r, 0, large, 1, end.x, end.y,
      "Z"
    ].join(" ");
  }

  function renderChart() {
    var totals = categoryTotals();
    var labels = Object.keys(totals);
    var data   = labels.map(function (l) { return totals[l]; });
    var colors = labels.map(colorFor);
    var total  = data.reduce(function (a, b) { return a + b; }, 0);

    var isEmpty = labels.length === 0;
    el.chartEmpty.hidden = !isEmpty;
    el.chartCanvas.style.visibility = isEmpty ? "hidden" : "visible";

    // Clear previous slices
    while (el.chartCanvas.firstChild) {
      el.chartCanvas.removeChild(el.chartCanvas.firstChild);
    }

    if (!isEmpty) {
      var cx = 100, cy = 100, r = 90;
      var cursor = 0;

      // Get surface color for slice border from CSS variable
      var surfaceColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--surface").trim() || "#fff";

      data.forEach(function (value, i) {
        var sliceDeg = (value / total) * 360;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", svgSlicePath(cx, cy, r, cursor, cursor + sliceDeg));
        path.setAttribute("fill", colors[i]);
        path.setAttribute("stroke", surfaceColor);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("aria-label", labels[i] + ": " + formatMoney(value));

        // Hover effect via title tooltip
        var titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
        var pct = Math.round((value / total) * 100);
        titleEl.textContent = labels[i] + " — " + formatMoney(value) + " (" + pct + "%)";
        path.appendChild(titleEl);

        el.chartCanvas.appendChild(path);
        cursor += sliceDeg;
      });

      // Centre hole (donut effect — optional, remove if you want a full pie)
      var hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hole.setAttribute("cx", cx);
      hole.setAttribute("cy", cy);
      hole.setAttribute("r", 42);
      hole.setAttribute("fill", surfaceColor);
      el.chartCanvas.appendChild(hole);
    }

    // Legend
    el.legend.innerHTML = "";
    labels.forEach(function (label, i) {
      var li = document.createElement("li");
      var dot = document.createElement("span");
      dot.className = "legend__dot";
      dot.style.background = colors[i];
      var pct = total ? Math.round((data[i] / total) * 100) : 0;
      var text = document.createElement("span");
      text.textContent = label + " ";
      var amt = document.createElement("span");
      amt.className = "legend__amt";
      amt.textContent = formatMoney(data[i]) + " (" + pct + "%)";
      li.appendChild(dot);
      li.appendChild(text);
      li.appendChild(amt);
      el.legend.appendChild(li);
    });
  }

  function renderAll() {
    renderBalance();
    renderList();
    renderChart();
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    // Re-render chart so hole and border colors update to new surface color
    renderChart();
  }

  el.themeToggle.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
  }

  // ---------- Init ----------
  function init() {
    initTheme();
    load();
    renderCategoryOptions();
    el.sortSelect.value = state.sort;
    renderAll();
  }

  init();
})();