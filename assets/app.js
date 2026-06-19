/*
 * app.js — UI wiring and rendering for Compass.
 * Reads/writes through Store; calls AI for the weekly reflection.
 */
(function () {
  "use strict";

  var data = Store.load();
  var settings = Store.loadSettings();

  /* ---------- small helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function todayIso() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function fmtMoney(n) {
    var sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    return parts[1] + "/" + parts[2] + "/" + parts[0].slice(2);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function persist() { Store.save(data); }

  /* ====================================================================
   * TAB NAVIGATION
   * ==================================================================== */
  function showView(name) {
    $$(".view").forEach(function (v) { v.hidden = v.id !== "view-" + name; });
    $$(".tab").forEach(function (t) {
      var active = t.dataset.view === name;
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (name === "finances") renderFinances();
  }

  $("#tabs").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (tab) showView(tab.dataset.view);
  });

  /* ====================================================================
   * HABITS
   * ==================================================================== */
  function renderHabits() {
    var list = $("#habit-list");
    list.innerHTML = "";
    $("#habit-empty").hidden = data.habits.length > 0;

    var today = todayIso();
    data.habits.forEach(function (h) {
      var doneToday = (h.history || []).indexOf(today) !== -1;
      var streak = AI.computeStreak(h.history || [], new Date());

      var row = document.createElement("div");
      row.className = "habit";

      var check = document.createElement("button");
      check.className = "habit-check" + (doneToday ? " done" : "");
      check.setAttribute("aria-pressed", doneToday ? "true" : "false");
      check.setAttribute("aria-label", "Mark " + h.name + " done for today");
      check.textContent = "✓";
      check.addEventListener("click", function () { toggleHabitToday(h.id); });

      var name = document.createElement("span");
      name.className = "habit-name" + (doneToday ? " done" : "");
      name.textContent = h.name;

      var streakEl = document.createElement("span");
      streakEl.className = "habit-streak";
      streakEl.innerHTML = "🔥 <strong>" + streak + "</strong> day" + (streak === 1 ? "" : "s");

      var del = document.createElement("button");
      del.className = "icon-btn";
      del.textContent = "✕";
      del.title = "Delete habit";
      del.setAttribute("aria-label", "Delete " + h.name);
      del.addEventListener("click", function () { deleteHabit(h.id); });

      row.appendChild(check);
      row.appendChild(name);
      row.appendChild(streakEl);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function toggleHabitToday(id) {
    var h = data.habits.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    h.history = h.history || [];
    var today = todayIso();
    var i = h.history.indexOf(today);
    if (i === -1) h.history.push(today);
    else h.history.splice(i, 1);
    persist();
    renderHabits();
  }

  function deleteHabit(id) {
    if (!confirm("Delete this habit and its history?")) return;
    data.habits = data.habits.filter(function (x) { return x.id !== id; });
    persist();
    renderHabits();
  }

  $("#habit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#habit-name");
    var name = input.value.trim();
    if (!name) return;
    data.habits.push({ id: Store.uid(), name: name, history: [] });
    input.value = "";
    persist();
    renderHabits();
  });

  /* ====================================================================
   * FINANCES
   * ==================================================================== */
  function renderFinances() {
    renderFinanceStats();
    renderTxnTable();
    renderChart();
  }

  function renderFinanceStats() {
    var monthPrefix = todayIso().slice(0, 7);
    var income = 0, expense = 0;
    data.transactions.forEach(function (t) {
      if ((t.date || "").slice(0, 7) !== monthPrefix) return;
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    var net = income - expense;
    $("#stat-income").textContent = fmtMoney(income);
    $("#stat-expense").textContent = fmtMoney(expense);
    var netEl = $("#stat-net");
    netEl.textContent = fmtMoney(net);
    netEl.className = "stat-value " + (net > 0 ? "pos" : net < 0 ? "neg" : "");
  }

  function renderTxnTable() {
    var body = $("#txn-body");
    body.innerHTML = "";
    var sorted = data.transactions.slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });
    $("#txn-empty").hidden = sorted.length > 0;

    sorted.forEach(function (t) {
      var tr = document.createElement("tr");

      var dateTd = document.createElement("td");
      dateTd.textContent = fmtDate(t.date);

      var descTd = document.createElement("td");
      descTd.textContent = t.desc;

      var typeTd = document.createElement("td");
      typeTd.textContent = t.type === "income" ? "Income" : "Expense";

      var amtTd = document.createElement("td");
      amtTd.className = "num " + (t.type === "income" ? "amt-pos" : "amt-neg");
      amtTd.textContent = (t.type === "income" ? "+" : "−") + fmtMoney(t.amount).replace("$", "$");

      var delTd = document.createElement("td");
      delTd.className = "num";
      var del = document.createElement("button");
      del.className = "icon-btn";
      del.textContent = "✕";
      del.title = "Delete";
      del.setAttribute("aria-label", "Delete transaction " + t.desc);
      del.addEventListener("click", function () { deleteTxn(t.id); });
      delTd.appendChild(del);

      tr.appendChild(dateTd);
      tr.appendChild(descTd);
      tr.appendChild(typeTd);
      tr.appendChild(amtTd);
      tr.appendChild(delTd);
      body.appendChild(tr);
    });
  }

  function deleteTxn(id) {
    data.transactions = data.transactions.filter(function (x) { return x.id !== id; });
    persist();
    renderFinances();
  }

  function monthlyNet() {
    // Returns array of { month: "YYYY-MM", net } sorted ascending, last 6 months.
    var byMonth = {};
    data.transactions.forEach(function (t) {
      var m = (t.date || "").slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = 0;
      byMonth[m] += t.type === "income" ? t.amount : -t.amount;
    });
    var months = Object.keys(byMonth).sort();
    return months.slice(-6).map(function (m) {
      return { month: m, net: byMonth[m] };
    });
  }

  function renderChart() {
    var canvas = $("#finance-chart");
    var rows = monthlyNet();
    $("#chart-empty").hidden = rows.length > 0;
    canvas.hidden = rows.length === 0;
    if (!rows.length) return;

    // High-DPI aware canvas sizing.
    var ratio = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 600;
    var cssH = 180;
    canvas.width = cssW * ratio;
    canvas.height = cssH * ratio;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var styles = getComputedStyle(document.documentElement);
    var ink = styles.getPropertyValue("--ink").trim() || "#111";
    var neg = styles.getPropertyValue("--neg").trim() || "#b00020";
    var line = styles.getPropertyValue("--line").trim() || "#e4e4e4";
    var faint = styles.getPropertyValue("--ink-faint").trim() || "#888";

    var padL = 8, padR = 8, padTop = 14, padBottom = 28;
    var plotW = cssW - padL - padR;
    var plotH = cssH - padTop - padBottom;

    var maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.net); }));
    if (maxAbs === 0) maxAbs = 1;
    var zeroY = padTop + plotH / 2;

    // Zero baseline.
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(cssW - padR, zeroY);
    ctx.stroke();

    var slot = plotW / rows.length;
    var barW = Math.min(slot * 0.55, 56);

    ctx.font = "11px " + (styles.getPropertyValue("--sans") || "sans-serif");
    ctx.textAlign = "center";

    rows.forEach(function (r, i) {
      var cx = padL + slot * i + slot / 2;
      var h = (Math.abs(r.net) / maxAbs) * (plotH / 2);
      ctx.fillStyle = r.net >= 0 ? ink : neg;
      if (r.net >= 0) {
        ctx.fillRect(cx - barW / 2, zeroY - h, barW, h);
      } else {
        ctx.fillRect(cx - barW / 2, zeroY, barW, h);
      }
      // Month label.
      ctx.fillStyle = faint;
      ctx.fillText(monthLabel(r.month), cx, cssH - 10);
    });
  }

  function monthLabel(m) {
    var names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var parts = m.split("-");
    return names[parseInt(parts[1], 10) - 1] + " '" + parts[0].slice(2);
  }

  $("#txn-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var type = $("#txn-type").value;
    var desc = $("#txn-desc").value.trim();
    var amount = parseFloat($("#txn-amount").value);
    var date = $("#txn-date").value || todayIso();
    if (!desc || isNaN(amount) || amount < 0) return;
    data.transactions.push({
      id: Store.uid(), type: type, desc: desc,
      amount: Math.round(amount * 100) / 100, date: date
    });
    $("#txn-desc").value = "";
    $("#txn-amount").value = "";
    persist();
    renderFinances();
  });

  /* ====================================================================
   * GOALS
   * ==================================================================== */
  function renderGoals() {
    var list = $("#goal-list");
    list.innerHTML = "";
    $("#goal-empty").hidden = data.goals.length > 0;

    data.goals.forEach(function (g) {
      var card = document.createElement("div");
      card.className = "goal";

      var top = document.createElement("div");
      top.className = "goal-top";

      var doneBox = document.createElement("input");
      doneBox.type = "checkbox";
      doneBox.checked = !!g.done;
      doneBox.setAttribute("aria-label", "Mark goal complete: " + g.name);
      doneBox.addEventListener("change", function () {
        g.done = doneBox.checked;
        if (g.done) g.progress = 100;
        persist();
        renderGoals();
      });

      var name = document.createElement("span");
      name.className = "goal-name" + (g.done ? " done" : "");
      name.textContent = g.name;

      var del = document.createElement("button");
      del.className = "icon-btn";
      del.textContent = "✕";
      del.title = "Delete goal";
      del.setAttribute("aria-label", "Delete goal " + g.name);
      del.addEventListener("click", function () { deleteGoal(g.id); });

      top.appendChild(doneBox);
      top.appendChild(name);
      top.appendChild(del);
      card.appendChild(top);

      if (!g.done) {
        var row = document.createElement("div");
        row.className = "goal-progress-row";

        var range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.step = "5";
        range.value = g.progress || 0;
        range.setAttribute("aria-label", "Progress for " + g.name);

        var pct = document.createElement("span");
        pct.className = "goal-pct";
        pct.textContent = (g.progress || 0) + "%";

        range.addEventListener("input", function () {
          pct.textContent = range.value + "%";
        });
        range.addEventListener("change", function () {
          g.progress = parseInt(range.value, 10);
          persist();
        });

        row.appendChild(range);
        row.appendChild(pct);
        card.appendChild(row);
      } else {
        var doneBar = document.createElement("div");
        doneBar.className = "goal-progress-row";
        var bar = document.createElement("div");
        bar.className = "goal-bar";
        bar.innerHTML = "<span style='width:100%'></span>";
        doneBar.appendChild(bar);
        card.appendChild(doneBar);
      }

      list.appendChild(card);
    });
  }

  function deleteGoal(id) {
    if (!confirm("Delete this goal?")) return;
    data.goals = data.goals.filter(function (x) { return x.id !== id; });
    persist();
    renderGoals();
  }

  $("#goal-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#goal-name");
    var name = input.value.trim();
    if (!name) return;
    data.goals.push({ id: Store.uid(), name: name, progress: 0, done: false });
    input.value = "";
    persist();
    renderGoals();
  });

  /* ====================================================================
   * REFLECT (AI)
   * ==================================================================== */
  var reflectBusy = false;

  // Minimal, safe formatting: bold **text** and turn "Wins:" style headings
  // into <h3>. Everything else stays as escaped text in a pre-wrap container.
  function renderReflection(text, el) {
    var esc = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    esc = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    el.innerHTML = esc;
  }

  $("#reflect-btn").addEventListener("click", function () {
    if (reflectBusy) return;
    settings = Store.loadSettings();

    if (!settings.apiKey) {
      toast("Add your API key in Settings first.");
      openSettings();
      return;
    }
    var hasData = data.habits.length || data.transactions.length || data.goals.length;
    if (!hasData) {
      toast("Add some habits, transactions, or goals first.");
      return;
    }

    var out = $("#reflect-output");
    var empty = $("#reflect-empty");
    var btn = $("#reflect-btn");
    var note = $("#reflect-note");

    empty.hidden = true;
    out.hidden = false;
    out.textContent = "";
    note.textContent = "Thinking…";
    btn.disabled = true;
    reflectBusy = true;

    var accumulated = "";
    AI.reflect(data, settings, function (chunk) {
      accumulated += chunk;
      renderReflection(accumulated, out);
    }).then(function () {
      note.textContent = "Done.";
    }).catch(function (err) {
      out.hidden = true;
      empty.hidden = false;
      note.textContent = "";
      toast(err.message || "Could not generate reflection.");
    }).then(function () {
      btn.disabled = false;
      reflectBusy = false;
    });
  });

  /* ====================================================================
   * SETTINGS MODAL
   * ==================================================================== */
  function openSettings() {
    settings = Store.loadSettings();
    $("#provider-select").value = settings.provider;
    $("#api-key").value = settings.apiKey;
    $("#model-name").value = settings.model;
    updateModelHint();
    $("#saved-flag").hidden = true;
    $("#settings-modal").hidden = false;
  }
  function closeSettings() { $("#settings-modal").hidden = true; }

  function updateModelHint() {
    var p = $("#provider-select").value;
    $("#model-hint").textContent =
      "Leave blank to use the default (" + AI.defaultModel(p) + ").";
  }

  $("#settings-btn").addEventListener("click", openSettings);
  $("#settings-close").addEventListener("click", closeSettings);
  $("#settings-modal").addEventListener("click", function (e) {
    if (e.target === e.currentTarget) closeSettings();
  });
  $("#provider-select").addEventListener("change", updateModelHint);

  $("#save-settings").addEventListener("click", function () {
    settings = {
      provider: $("#provider-select").value,
      apiKey: $("#api-key").value.trim(),
      model: $("#model-name").value.trim()
    };
    Store.saveSettings(settings);
    $("#saved-flag").hidden = false;
    setTimeout(function () { $("#saved-flag").hidden = true; }, 1800);
  });

  $("#clear-key").addEventListener("click", function () {
    $("#api-key").value = "";
    settings = Store.loadSettings();
    settings.apiKey = "";
    Store.saveSettings(settings);
    toast("Key cleared.");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#settings-modal").hidden) closeSettings();
  });

  /* ====================================================================
   * EXPORT / IMPORT / RESET
   * ==================================================================== */
  $("#export-btn").addEventListener("click", function () {
    var blob = new Blob([Store.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "compass-data-" + todayIso() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $("#import-btn").addEventListener("click", function () { $("#import-file").click(); });
  $("#import-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        data = Store.importJSON(reader.result);
        renderAll();
        toast("Data imported.");
      } catch (err) {
        toast("Import failed — not a valid Compass file.");
      }
      $("#import-file").value = "";
    };
    reader.readAsText(file);
  });

  $("#reset-btn").addEventListener("click", function () {
    if (!confirm("Delete ALL Compass data in this browser? This cannot be undone.")) return;
    Store.reset();
    data = Store.load();
    renderAll();
    toast("All data cleared.");
  });

  /* ====================================================================
   * INIT
   * ==================================================================== */
  function renderAll() {
    renderHabits();
    renderGoals();
    renderFinances();
  }

  // Default the transaction date field to today.
  $("#txn-date").value = todayIso();

  renderAll();
  showView("habits");

  // Redraw the chart on resize so the canvas stays crisp.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!$("#view-finances").hidden) renderChart();
    }, 150);
  });
})();
