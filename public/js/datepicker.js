/* Kalma date picker: a branded calendar instead of the browser's own date box.
   <input type="date" data-dp="range" data-dp-end="<checkout input id>">  check-in and check-out in one calendar
   <input type="date" data-dp="single">                                    one date
   <div data-dp-inline data-for="<input id>">                              calendar always open inside the page
   The real inputs stay in the form (hidden) so forms and validation keep working.
   Pages can block nights with KalmaDate.get(input).setBlocked(fn(iso) → true). */
(function () {
  "use strict";

  var LANG = (document.documentElement.lang || "id").slice(0, 2) === "en" ? "en" : "id";
  var LOCALE = LANG === "en" ? "en-GB" : "id-ID";
  var TXT = {
    id: { checkin: "Check-in", checkout: "Check-out", pick: "Pilih tanggal", pickIn: "Pilih tanggal check-in", pickOut: "Sekarang pilih tanggal check-out", to: "sampai",
      night: "malam", nights: "malam", clear: "Hapus", done: "Selesai", prev: "Bulan sebelumnya", next: "Bulan berikutnya", full: "Penuh", close: "Tutup" },
    en: { checkin: "Check-in", checkout: "Check-out", pick: "Choose a date", pickIn: "Choose your check-in date", pickOut: "Now choose your check-out date", to: "to",
      night: "night", nights: "nights", clear: "Clear", done: "Done", prev: "Previous month", next: "Next month", full: "Full", close: "Close" }
  }[LANG];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function nightsBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function nice(s, withYear) {
    var d = parse(s);
    if (!d) return "";
    var o = { weekday: "short", day: "numeric", month: "short" };
    if (withYear) o.year = "numeric";
    return d.toLocaleDateString(LOCALE, o);
  }
  var TODAY = iso(new Date());
  var monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  var WEEK = (function () {
    var out = [], d = new Date(2024, 0, 1); // a Monday
    for (var i = 0; i < 7; i++) { out.push(d.toLocaleDateString(LOCALE, { weekday: "narrow" })); d.setDate(d.getDate() + 1); }
    return out;
  })();
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var ARROW = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7") + '"/></svg>'; };

  var pickers = [];
  var openOne = null;

  function Picker(input, opts) {
    var self = this;
    this.mode = opts.mode || "single";
    this.inputs = [input];
    if (this.mode === "range") this.inputs.push(opts.end);
    this.inline = opts.inline || null;
    this.min = input.getAttribute("min") || TODAY;
    this.blocked = function () { return false; };
    this.start = input.value || "";
    this.end = this.mode === "range" ? opts.end.value || "" : "";
    this.hover = "";
    this.view = parse(this.start || this.min);
    this.view.setDate(1);

    // the real inputs stay in the form, hidden; buttons show the chosen date
    this.fields = this.inputs.map(function (inp, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-field";
      b.id = inp.id;
      inp.id = inp.id + "-value";
      inp.type = "hidden";
      b.setAttribute("aria-haspopup", "dialog");
      b.innerHTML = ICON + '<span class="dp-field__text"></span>';
      b.addEventListener("click", function () { self.focusEnd = i === 1 && self.start; self.open(); });
      inp.parentNode.insertBefore(b, inp);
      return b;
    });
    if (this.inline) {
      this.fields.forEach(function (b) { b.addEventListener("click", function () { self.inline.scrollIntoView({ block: "nearest" }); }); });
      this.box = this.inline;
      this.box.classList.add("dp", "dp--inline");
      this.render();
    }
    this.sync(false);
  }

  Picker.prototype.months = function () {
    if (this.inline) return this.inline.clientWidth >= 620 ? 2 : 1;
    return this.mode === "range" && window.innerWidth >= 760 ? 2 : 1;
  };

  /* first blocked night after the check-in: the stay cannot run past it (checking out that morning is fine) */
  Picker.prototype.limit = function () {
    if (this.mode !== "range" || !this.start || this.end) return "";
    var d = this.start;
    for (var i = 0; i < 400; i++) { d = addDays(d, 1); if (this.blocked(d)) return d; }
    return "";
  };

  Picker.prototype.dayState = function (s) {
    var st = { off: s < this.min, full: this.blocked(s) };
    if (this.mode === "range" && this.start && !this.end) {
      var lim = this.limit();
      // choosing the check-out: any later day up to the first full night
      if (s > this.start) { st.off = st.off || (lim && s > lim); st.full = st.full && s !== lim; }
    }
    if (st.full) st.off = true;
    var to = this.end || (this.mode === "range" && this.start && this.hover > this.start && !(this.limit() && this.hover > this.limit()) ? this.hover : "");
    st.start = s === this.start;
    st.end = s === to && this.mode === "range";
    st.between = this.mode === "range" && this.start && to && s > this.start && s < to;
    st.today = s === TODAY;
    return st;
  };

  Picker.prototype.render = function () {
    var self = this, n = this.months(), html = "";
    var hint = this.mode !== "range" ? TXT.pick : !this.start || this.end ? TXT.pickIn : TXT.pickOut;
    if (!this.inline) html += '<div class="dp__top"><b>' + hint + '</b><button type="button" class="dp__x" data-close aria-label="' + TXT.close + '">×</button></div>';
    else html += '<p class="dp__hint">' + hint + "</p>";
    html += '<div class="dp__nav"><button type="button" class="dp__arrow" data-step="-1" aria-label="' + TXT.prev + '">' + ARROW(-1) + '</button><button type="button" class="dp__arrow" data-step="1" aria-label="' + TXT.next + '">' + ARROW(1) + "</button></div>";
    html += '<div class="dp__months">';
    for (var m = 0; m < n; m++) {
      var first = new Date(this.view.getFullYear(), this.view.getMonth() + m, 1);
      html += '<div class="dp__month"><p class="dp__title">' + monthFmt.format(first) + '</p><div class="dp__grid" role="grid">';
      WEEK.forEach(function (w) { html += '<span class="dp__wd" aria-hidden="true">' + w + "</span>"; });
      var lead = (first.getDay() + 6) % 7;
      for (var e = 0; e < lead; e++) html += "<span></span>";
      var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        var s = first.getFullYear() + "-" + pad(first.getMonth() + 1) + "-" + pad(d);
        var st = this.dayState(s);
        var cls = "dp__day" + (st.start ? " is-start" : "") + (st.end ? " is-end" : "") + (st.between ? " is-between" : "") + (st.today ? " is-today" : "") + (st.full ? " is-full" : "");
        html += '<button type="button" class="' + cls + '" data-day="' + s + '"' + (st.off ? " disabled" : "") + (st.start || st.end ? ' aria-pressed="true"' : "") +
          ' aria-label="' + nice(s, true) + (st.full ? " · " + TXT.full : "") + '">' + d + "</button>";
      }
      html += "</div></div>";
    }
    html += "</div>";
    var summary = this.summary();
    if (!this.inline) html += '<div class="dp__foot"><span class="dp__sum">' + summary + '</span><button type="button" class="dp__clear" data-clear>' + TXT.clear + '</button><button type="button" class="btn btn--primary btn--sm" data-close>' + TXT.done + "</button></div>";
    else html += '<div class="dp__foot"><span class="dp__sum">' + summary + '</span><button type="button" class="dp__clear" data-clear>' + TXT.clear + "</button></div>";
    this.box.innerHTML = html;
    var prev = this.box.querySelector('[data-step="-1"]');
    var firstShown = new Date(this.view.getFullYear(), this.view.getMonth(), 1);
    prev.disabled = iso(firstShown) <= this.min.slice(0, 8) + "01";
    if (!this.wired) {
      this.wired = true;
      this.box.addEventListener("click", function (ev) {
        var t = ev.target.closest("button");
        if (!t || !self.box.contains(t)) return;
        if (t.dataset.day) self.pick(t.dataset.day);
        else if (t.dataset.step) { self.view.setMonth(self.view.getMonth() + Number(t.dataset.step)); self.render(); }
        else if (t.hasAttribute("data-clear")) { self.start = ""; self.end = ""; self.sync(true); self.render(); }
        else if (t.hasAttribute("data-close")) self.close(true);
      });
      this.box.addEventListener("mouseover", function (ev) {
        var t = ev.target.closest("[data-day]");
        if (!t || self.mode !== "range" || !self.start || self.end) return;
        if (self.hover !== t.dataset.day) { self.hover = t.dataset.day; self.paint(); }
      });
      this.box.addEventListener("keydown", function (ev) {
        var t = ev.target.closest("[data-day]");
        if (!t) return;
        var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
        if (!step) return;
        ev.preventDefault();
        var next = addDays(t.dataset.day, step), b = self.box.querySelector('[data-day="' + next + '"]');
        if (!b) { self.view.setMonth(self.view.getMonth() + (step > 0 ? 1 : -1)); self.render(); b = self.box.querySelector('[data-day="' + next + '"]'); }
        if (b) b.focus();
      });
    }
  };

  /* repaint the range highlight without rebuilding the calendar (smooth hover) */
  Picker.prototype.paint = function () {
    var self = this;
    this.box.querySelectorAll("[data-day]").forEach(function (b) {
      var st = self.dayState(b.dataset.day);
      b.classList.toggle("is-end", st.end);
      b.classList.toggle("is-between", st.between);
    });
  };

  Picker.prototype.summary = function () {
    if (this.mode !== "range") return this.start ? nice(this.start, true) : "";
    if (this.start && this.end) {
      var n = nightsBetween(this.start, this.end);
      return nice(this.start) + " " + TXT.to + " " + nice(this.end) + " · <b>" + n + " " + (n === 1 ? TXT.night : TXT.nights) + "</b>";
    }
    return this.start ? nice(this.start) + " " + TXT.to + " …" : "";
  };

  Picker.prototype.pick = function (s) {
    if (this.mode !== "range") { this.start = s; this.sync(true); if (this.inline) this.render(); else this.close(true); return; }
    if (!this.start || this.end || s <= this.start) { this.start = s; this.end = ""; this.hover = ""; }
    else { this.end = s; }
    this.sync(true);
    this.render();
    if (this.end && !this.inline) { var self = this; setTimeout(function () { self.close(true); }, 260); }
  };

  /* write the dates into the hidden inputs and the buttons; tell the page with a change event */
  Picker.prototype.sync = function (fire) {
    var vals = [this.start, this.end];
    var self = this;
    this.inputs.forEach(function (inp, i) {
      var old = inp.value;
      inp.value = vals[i] || "";
      var txt = self.fields[i].querySelector(".dp-field__text");
      txt.textContent = vals[i] ? nice(vals[i], true) : (inp.getAttribute("placeholder") || TXT.pick);
      self.fields[i].classList.toggle("is-empty", !vals[i]);
      if (fire && old !== inp.value) inp.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  Picker.prototype.open = function () {
    if (this.inline) return;
    if (openOne && openOne !== this) openOne.close(false);
    openOne = this;
    if (!this.box) {
      this.box = document.createElement("div");
      this.box.className = "dp dp--pop";
      this.box.setAttribute("role", "dialog");
      this.box.setAttribute("aria-modal", "false");
      this.shade = document.createElement("div");
      this.shade.className = "dp-shade";
      var self = this;
      this.shade.addEventListener("click", function () { self.close(true); });
      document.body.appendChild(this.shade);
      document.body.appendChild(this.box);
    }
    this.scrolled = false;
    var anchor = this.start ? parse(this.start) : parse(this.min);
    this.view = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    this.render();
    this.box.classList.add("is-open");
    this.shade.classList.add("is-open");
    this.place();
    this.fields.forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    var focus = this.box.querySelector(".is-start:not([disabled])") || this.box.querySelector(".dp__day:not([disabled])");
    if (focus) focus.focus({ preventScroll: true });
  };

  /* under the field on large screens, as a sheet from the bottom on phones */
  Picker.prototype.place = function () {
    var box = this.box;
    if (window.innerWidth < 640) { box.classList.add("is-sheet"); box.style.left = box.style.top = ""; return; }
    box.classList.remove("is-sheet");
    // always open right under the booking bar (like booking sites and apps do), never above it
    var bar = this.fields[0].closest(".search") || this.fields[0];
    var r = bar.getBoundingClientRect();
    var w = box.offsetWidth, h = box.offsetHeight;
    if (r.bottom + 8 + h > window.innerHeight - 12 && !this.scrolled) {
      // short screen: scroll the page once so the whole calendar fits below the bar
      this.scrolled = true;
      window.scrollBy(0, Math.min(r.top - 84, r.bottom + 8 + h - window.innerHeight + 16));
      r = bar.getBoundingClientRect();
    }
    box.style.left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12) + "px";
    box.style.top = Math.max(12, r.bottom + 8) + "px";
  };

  Picker.prototype.close = function (refocus) {
    if (!this.box || this.inline) return;
    this.box.classList.remove("is-open");
    this.shade.classList.remove("is-open");
    this.fields.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (openOne === this) openOne = null;
    if (refocus) this.fields[this.end ? 1 : 0].focus({ preventScroll: true });
  };

  Picker.prototype.setBlocked = function (fn) { this.blocked = fn || function () { return false; }; if (this.box) this.render(); };
  Picker.prototype.set = function (start, end) { this.start = start || ""; this.end = end || ""; this.sync(true); if (this.box) this.render(); };

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openOne) openOne.close(true); });
  window.addEventListener("resize", function () { if (openOne) openOne.place(); pickers.forEach(function (p) { if (p.inline) p.render(); }); });
  window.addEventListener("scroll", function () { if (openOne && !openOne.box.classList.contains("is-sheet")) openOne.place(); }, { passive: true });

  function init(root) {
    (root || document).querySelectorAll("input[data-dp]").forEach(function (inp) {
      if (inp.dataset.dpReady) return;
      inp.dataset.dpReady = "1";
      var mode = inp.dataset.dp === "range" ? "range" : "single";
      var end = mode === "range" ? document.getElementById(inp.dataset.dpEnd) : null;
      var inline = document.querySelector('[data-dp-inline][data-for="' + inp.id + '"]');
      var p = new Picker(inp, { mode: mode, end: end, inline: inline });
      p.input = inp;
      pickers.push(p);
    });
  }

  window.KalmaDate = {
    init: init,
    get: function (inp) {
      for (var i = 0; i < pickers.length; i++) if (pickers[i].input === inp || pickers[i].inputs.indexOf(inp) >= 0) return pickers[i];
      return null;
    },
    addDays: addDays, nights: nightsBetween, nice: nice
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
  else init();
})();
