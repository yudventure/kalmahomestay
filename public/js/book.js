/* Kalma booking page: choose a room (or activity) and dates, fill in your details, pay with Midtrans Snap.
   Prices shown here are only a preview: the server prices the order again before payment. */
(function () {
  "use strict";

  var CFG = JSON.parse(document.getElementById("kalma-config").textContent);
  var UI = CFG.ui;
  var PAY = CFG.payments || { enabled: false, percent: 100 };
  var form = document.getElementById("bk-form");
  if (!form) return;
  var f = form.elements;
  var errBox = form.querySelector(".bk-err");
  var btn = document.getElementById("bk-submit");
  var rooms = {};
  CFG.rooms.forEach(function (r) { rooms[r.id] = r; });
  var trip = CFG.activity;
  var rp = function (n) { return "Rp " + Number(n).toLocaleString("id-ID"); };
  var $ = function (id) { return document.getElementById(id); };
  var full = {}; // room id → { night: true }
  var DP = window.KalmaDate;
  var inEl = f.checkin, outEl = f.checkout, dateEl = f.date;

  function nights() { return inEl && outEl && inEl.value && outEl.value ? DP.nights(inEl.value, outEl.value) : 0; }
  function room() { var c = form.querySelector('input[name="room"]:checked'); return c ? rooms[c.value] : null; }
  function count() { var el = f.guests || f.people; return parseInt(el.value, 10) || 0; }

  /* ---------------------------------------------------------------- steppers (guests, people) */
  form.querySelectorAll(".stepper").forEach(function (box) {
    var input = box.querySelector("input");
    function clamp(v) {
      var min = Number(box.dataset.min) || 1, max = Number(box.dataset.max) || 20;
      v = Math.max(min, Math.min(max, parseInt(v, 10) || min));
      input.value = v;
      box.querySelector('[data-d="-1"]').disabled = v <= min;
      box.querySelector('[data-d="1"]').disabled = v >= max;
      refresh();
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-d]");
      if (b) clamp((parseInt(input.value, 10) || 0) + Number(b.dataset.d));
    });
    input.addEventListener("change", function () { clamp(input.value); });
    box.clamp = clamp;
    clamp(input.value);
  });

  /* ---------------------------------------------------------------- availability: full nights per room */
  function isFull(roomId, from, to) {
    var map = full[roomId] || {};
    for (var d = from; d < to; d = DP.addDays(d, 1)) if (map[d]) return true;
    return false;
  }
  function applyBlocked() {
    var r = room();
    if (!r || !inEl) return;
    var picker = DP.get(inEl);
    var map = full[r.id] || {};
    if (picker) picker.setBlocked(function (d) { return Boolean(map[d]); });
    // mark rooms that are full for the chosen dates
    form.querySelectorAll(".rpick").forEach(function (card) {
      var busy = inEl.value && outEl.value && isFull(card.dataset.room, inEl.value, outEl.value);
      card.classList.toggle("is-full", Boolean(busy));
      card.querySelector(".rpick__full").hidden = !busy;
    });
  }
  if (inEl) {
    fetch(CFG.base + "/api/availability").then(function (r) { return r.json(); }).then(function (data) {
      Object.keys(data.rooms || {}).forEach(function (id) {
        full[id] = {};
        data.rooms[id].forEach(function (d) { full[id][d] = true; });
      });
      applyBlocked();
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- summary */
  function refresh() {
    if (!f.guests && !f.people) return;
    var n = count(), calc = $("sum-calc"), dp = $("sum-dp"), total = 0, label = "";
    if (trip) {
      $("sum-dates").textContent = dateEl && dateEl.value ? DP.nice(dateEl.value, true) : UI.emptyDates;
      $("sum-guests").textContent = n + " " + UI.persons;
      if (trip.price) {
        total = trip.price * n;
        label = rp(trip.price) + " × " + n + " " + UI.persons;
      }
    } else {
      var r = room(), k = nights();
      if (!r) return;
      $("sum-title").textContent = r.name;
      var card = form.querySelector('.rpick[data-room="' + r.id + '"] .rpick__img');
      if (card) $("sum-img").setAttribute("style", card.getAttribute("style") || "");
      $("sum-img").className = "photo sum__img " + (card ? card.className.replace(/.*\b(ph-[a-z]+)\b.*/, "$1") : "");
      $("sum-dates").textContent = k > 0 ? DP.nice(inEl.value) + " " + (CFG.lang === "en" ? "to" : "sampai") + " " + DP.nice(outEl.value) + " · " + k + " " + (k === 1 ? UI.night : UI.nights) : UI.emptyDates;
      $("sum-guests").textContent = n + " " + UI.persons;
      if (k > 0) {
        total = r.price * n * k;
        label = rp(r.price) + " × " + n + " " + UI.persons + " × " + k + " " + UI.nights;
      }
    }
    calc.hidden = !label;
    calc.textContent = label;
    $("sum-total").textContent = total ? rp(total) : trip && !trip.price ? UI.onRequest : "-";
    var deposit = PAY.enabled && PAY.percent < 100 && total;
    dp.hidden = !deposit;
    if (deposit) dp.innerHTML = "<span>" + UI.payToday + "</span><b>" + rp(Math.round(total * PAY.percent / 100)) + "</b><span>" + UI.payLater + "</span><b>" + rp(total - Math.round(total * PAY.percent / 100)) + "</b>";
    var sum = btn.querySelector(".bk-submit__sum");
    var due = deposit ? Math.round(total * PAY.percent / 100) : total;
    sum.textContent = PAY.enabled && due ? " · " + rp(due) : "";
    steps();
  }

  /* step markers follow what is filled in */
  var paying = false;
  function steps() {
    if (paying) return;
    var datesOk = trip ? dateEl && dateEl.value : nights() > 0;
    var detailsOk = f.name.value.trim() && /@/.test(f.email.value) && f.phone.value.replace(/\D/g, "").length >= 8;
    var on = datesOk ? (detailsOk ? 3 : 2) : 1;
    document.querySelectorAll(".steps li").forEach(function (li) {
      var s = Number(li.dataset.step);
      li.classList.toggle("is-on", s === on);
      li.classList.toggle("is-done", s < on);
    });
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "room") {
      var r = room();
      var box = f.guests && f.guests.closest(".stepper");
      if (box) { box.dataset.max = r.maxGuests; box.clamp(f.guests.value); }
      applyBlocked();
      // the chosen dates may not be free in the new room
      if (inEl.value && outEl.value && isFull(r.id, inEl.value, outEl.value)) DP.get(inEl).set("", "");
    }
    if (e.target === inEl || e.target === outEl) applyBlocked();
    refresh();
  });
  form.addEventListener("input", steps);
  refresh();

  /* ---------------------------------------------------------------- submit & pay */
  var snapReady = null;
  function loadSnap() {
    if (window.snap) return Promise.resolve(window.snap);
    if (!snapReady) {
      snapReady = new Promise(function (resolve, reject) {
        var sc = document.createElement("script");
        sc.src = PAY.snapJs; sc.setAttribute("data-client-key", PAY.clientKey); sc.async = true;
        sc.onload = function () { resolve(window.snap); };
        sc.onerror = function () { snapReady = null; reject(new Error("snap")); };
        document.head.appendChild(sc);
      });
    }
    return snapReady;
  }
  if (PAY.enabled) form.addEventListener("focusin", function () { loadSnap().catch(function () {}); }, { once: true });

  function invalid(el, msg) {
    var box = el.closest(".field") || el.closest(".bk-card") || el;
    box.classList.add("is-invalid");
    var target = el.type === "hidden" ? $(el.id.replace(/-value$/, "")) || el : el;
    if (target.focus) target.focus();
    if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
    return msg;
  }
  function precheck() {
    form.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    if (trip) {
      if (!dateEl.value) return invalid(dateEl, UI.errDate);
    } else {
      if (!inEl.value || !outEl.value) return invalid(inEl, CFG.lang === "en" ? "Please choose your check-in and check-out dates." : "Pilih tanggal check-in dan check-out dulu, ya.");
      if (isFull(room().id, inEl.value, outEl.value)) return invalid(inEl, UI.full);
    }
    if (!f.name.value.trim()) return invalid(f.name, CFG.lang === "en" ? "May we have your name?" : "Boleh tahu namamu?");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return invalid(f.email, UI.errEmail);
    if (f.phone.value.replace(/\D/g, "").length < 8) return invalid(f.phone, UI.errPhone);
    if (!f.agree.checked) return invalid(f.agree.closest(".agree"), UI.errAgree);
    return "";
  }

  var label = btn.querySelector("span").textContent;
  function busy(on, text) {
    btn.disabled = on;
    btn.querySelector("span").textContent = on ? text : label;
  }

  /* Kalma payment panel: Midtrans methods load inside the page, not in a bare popup */
  var box = $("bk-paybox");
  var snapBox = $("snap-embed");
  var sections = form.querySelectorAll(".bk-card[data-sec]");
  function showPanel(on) {
    paying = on;
    sections.forEach(function (sec) { sec.hidden = on; });
    if (box) box.hidden = !on;
    if (on) {
      document.querySelectorAll(".steps li").forEach(function (li) {
        var s = Number(li.dataset.step);
        li.classList.toggle("is-on", s === 3);
        li.classList.toggle("is-done", s < 3);
      });
    } else steps();
    var top = (on ? box : form).getBoundingClientRect().top + window.pageYOffset - 100;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  function openPayment(snap, r) {
    var done = function () { window.location.href = r.doneUrl; };
    var handlers = {
      language: CFG.lang === "id" ? "id" : "en", // Midtrans speaks the page's language, English by default
      onSuccess: done, onPending: done, onError: done,
      onClose: function () { errBox.textContent = UI.payClosed; if (box && !box.hidden) showPanel(false); }
    };
    if (!box || typeof snap.embed !== "function") return snap.pay(r.token, handlers);
    $("paybox-order").textContent = r.orderId || "-";
    $("paybox-due").textContent = rp(r.amount);
    $("paybox-err").textContent = "";
    snapBox.innerHTML = "";
    showPanel(true);
    try {
      snap.embed(r.token, Object.assign({ embedId: "snap-embed" }, handlers));
    } catch (err) {
      showPanel(false);
      snap.pay(r.token, handlers);
    }
  }
  if (box) $("paybox-edit").addEventListener("click", function () {
    snapBox.innerHTML = "";
    errBox.textContent = "";
    showPanel(false);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = precheck();
    errBox.textContent = msg;
    if (msg) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data.lang = CFG.lang;
    busy(true, PAY.enabled ? UI.opening : UI.sending);
    var snapP = PAY.enabled ? loadSnap().catch(function () { return null; }) : Promise.resolve(null);
    fetch(CFG.base + "/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
      .then(function (r) {
        if (!r.ok) { errBox.textContent = r.error || (CFG.lang === "en" ? "Something went wrong. Please try again." : "Ada gangguan. Coba lagi, ya."); return busy(false); }
        if (r.mode === "pay" && r.token) {
          return snapP.then(function (snap) {
            if (!snap) { window.location.href = r.redirectUrl || r.doneUrl; return; }
            busy(false);
            openPayment(snap, r);
          });
        }
        window.location.href = r.doneUrl;
      })
      .catch(function () { errBox.textContent = CFG.lang === "en" ? "No connection. Please try again." : "Koneksi terputus. Coba lagi, ya."; busy(false); });
  });
})();
