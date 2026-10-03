/* Kalma Raja Ampat — site behavior. Text and contact settings come from the server (#kalma-config). */
(function () {
  "use strict";

  var CFG = JSON.parse(document.getElementById("kalma-config").textContent);
  var UI = CFG.ui;
  document.documentElement.classList.add("js");

  /* ---------------------------------------------------------------- nav */
  var nav = document.querySelector(".nav");
  var burger = document.querySelector(".nav__burger");
  var menu = document.getElementById("menu");
  function closeMenu() { menu.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
  burger.addEventListener("click", function () {
    var open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open); burger.setAttribute("aria-expanded", String(open));
  });
  menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  var waFloat = document.querySelector(".wa-float");
  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
    waFloat.classList.toggle("is-hidden", window.scrollY < 400);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------- reveal */
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------------------------------------------------------------- dates */
  function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  var today = iso(new Date());
  function pairDates(inEl, outEl) {
    inEl.min = today; outEl.min = today;
    inEl.addEventListener("change", function () {
      if (!inEl.value) return;
      var next = new Date(inEl.value + "T00:00"); next.setDate(next.getDate() + 1);
      outEl.min = iso(next);
      if (!outEl.value || outEl.value <= inEl.value) outEl.value = iso(new Date(next.getTime() + 2 * 864e5));
    });
  }
  var qIn = document.getElementById("q-in"), qOut = document.getElementById("q-out"), qG = document.getElementById("q-g");
  pairDates(qIn, qOut);
  var services = document.getElementById("kamar");
  var smooth = function () { return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; };

  /* hero search → remember dates/guests and show the services; "Book" on a card opens the dialog with them */
  document.getElementById("quick").addEventListener("submit", function (e) {
    e.preventDefault();
    services.scrollIntoView({ behavior: smooth() });
  });

  /* ---------------------------------------------------------------- hero video tiles
     The browser starts them itself (autoplay muted) for the fastest start; here we only pause
     them for reduced-motion / data-saver visitors, when scrolled away, or in a background tab. */
  var clips = Array.prototype.slice.call(document.querySelectorAll(".tile__video"));
  var conn = navigator.connection || {};
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || conn.saveData;
  var playAll = function (on) {
    clips.forEach(function (v) {
      if (on) { var p = v.play(); if (p) p.catch(function () {}); } else v.pause();
    });
  };
  if (clips.length) {
    if (calm) {
      clips.forEach(function (v) { v.removeAttribute("autoplay"); v.preload = "none"; v.pause(); });
    } else {
      var heroSeen = true;
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          heroSeen = entries[0].isIntersecting;
          playAll(heroSeen && !document.hidden);
        }).observe(document.querySelector(".mosaic"));
      }
      document.addEventListener("visibilitychange", function () { playAll(heroSeen && !document.hidden); });
    }
  }

  /* ---------------------------------------------------------------- hermit crab walking along the wave
     It walks back and forth under the booking box. The wave SVG stretches with the screen, so we
     sample the real curve once and hand the whole walk to the Web Animations API: after that it
     runs on the compositor with no JavaScript per frame. Rebuilt only when the size changes. */
  var shore = document.querySelector(".shore");
  var crab = shore && shore.querySelector(".crab");
  var line = shore && shore.querySelector(".shore__line");
  var track = document.querySelector(".search");
  if (crab && line && line.getTotalLength && crab.animate) {
    var VB_W = 1440, VB_H = 90, pts = [], total = line.getTotalLength();
    for (var i = 0; i <= 240; i++) { var pt = line.getPointAtLength(total * i / 240); pts.push([pt.x, pt.y]); }
    var yAt = function (x) {
      for (var j = 1; j < pts.length; j++) {
        if (pts[j][0] >= x) { var a = pts[j - 1], b = pts[j]; return a[1] + (b[1] - a[1]) * ((x - a[0]) / ((b[0] - a[0]) || 1)); }
      }
      return pts[pts.length - 1][1];
    };
    var walk = null, builtFor = "";
    var build = function () {
      var w = shore.clientWidth, h = shore.clientHeight;
      if (!w || !h) return;
      // Desktop: from under the logo to under the first menu item ("Beranda"/"Home").
      // Phones (menu folded into the burger): under the booking box.
      var sr = shore.getBoundingClientRect(), from, to;
      var logo = document.querySelector(".nav__logo"), first = document.querySelector(".nav__links a");
      var burger = document.querySelector(".nav__burger");
      if (logo && first && burger && getComputedStyle(burger).display === "none") {
        var lr = logo.getBoundingClientRect(), fr = first.getBoundingClientRect();
        from = lr.left + lr.width / 2 - sr.left;
        to = fr.left + fr.width / 2 - sr.left;
      } else {
        var tr = track ? track.getBoundingClientRect() : null;
        from = tr ? tr.left - sr.left + 40 : w * 0.1;
        to = tr ? tr.right - sr.left - 40 : w * 0.9;
      }
      from = Math.max(30, from); to = Math.min(w - 30, Math.max(from + 80, to));
      var key = w + "x" + h + ":" + Math.round(from) + "-" + Math.round(to);
      if (key === builtFor) return;
      builtFor = key;
      var at = function (px, face) {
        var x = px / w * VB_W;
        var dy = (yAt(Math.min(VB_W, x + 10)) - yAt(Math.max(0, x - 10))) / VB_H * h;
        var ang = Math.atan2(dy, 20 / VB_W * w) * 180 / Math.PI;
        return "translate(" + (px - 26).toFixed(1) + "px," + (yAt(x) / VB_H * h - 37).toFixed(1) + "px) rotate(" + ang.toFixed(2) + "deg) scaleX(" + face + ")";
      };
      // forward walk, short pause, turn, walk back, short pause
      var steps = 24, walkT = (to - from) / 24, pause = 1.4, cycle = 2 * walkT + 2 * pause, frames = [];
      for (var k = 0; k <= steps; k++) frames.push({ transform: at(from + (to - from) * k / steps, 1), offset: (walkT * k / steps) / cycle });
      frames.push({ transform: at(to, 1), offset: (walkT + pause * 0.8) / cycle });
      for (k = 0; k <= steps; k++) frames.push({ transform: at(to - (to - from) * k / steps, -1), offset: (walkT + pause + walkT * k / steps) / cycle });
      frames.push({ transform: at(from, -1), offset: (2 * walkT + pause * 1.8) / cycle });
      frames.push({ transform: at(from, 1), offset: 1 });
      var keep = walk ? walk.currentTime : 0;
      if (walk) walk.cancel();
      walk = crab.animate(frames, { duration: cycle * 1000, iterations: Infinity, easing: "linear" });
      walk.currentTime = keep % (cycle * 1000);
      crab.classList.add("is-on");
      if (calm) walk.pause();
    };
    build();
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    if (calm) crab.classList.add("is-resting");
    else if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (!walk) return;
        if (entries[0].isIntersecting) { walk.play(); crab.classList.remove("is-resting"); }
        else { walk.pause(); crab.classList.add("is-resting"); }
      }).observe(shore);
    }
  }

  /* ---------------------------------------------------------------- card carousel arrows */
  document.querySelectorAll(".arrows[data-for]").forEach(function (box) {
    var track = document.getElementById(box.dataset.for);
    var prev = box.querySelector('[data-dir="-1"]'), next = box.querySelector('[data-dir="1"]');
    function update() {
      var max = track.scrollWidth - track.clientWidth;
      box.hidden = max < 4;
      prev.disabled = track.scrollLeft < 4;
      next.disabled = track.scrollLeft > max - 4;
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-dir]");
      if (!b) return;
      var card = track.firstElementChild;
      var step = card ? card.getBoundingClientRect().width + 20 : track.clientWidth;
      track.scrollBy({ left: step * Number(b.dataset.dir) });
    });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  /* ---------------------------------------------------------------- guest stories */
  var slides = document.querySelectorAll(".quote__item");
  var current = 0;
  document.querySelectorAll("[data-q]").forEach(function (b) {
    b.addEventListener("click", function () {
      slides[current].hidden = true;
      current = (current + Number(b.dataset.q) + slides.length) % slides.length;
      slides[current].hidden = false;
    });
  });

  /* ---------------------------------------------------------------- book & pay dialog
     Prices are per person per night. With Midtrans keys set the server returns a Snap token and the
     payment popup opens here; without them the booking goes to WhatsApp like before. */
  var dlg = document.getElementById("checkout");
  var coForm = document.getElementById("co-form");
  var coDone = document.getElementById("co-done");
  var coErr = coForm.querySelector(".bform__err");
  var coBtn = document.getElementById("co-submit");
  var f = coForm.elements;
  var PAY = CFG.payments || { enabled: false, percent: 100 };
  var rooms = {};
  CFG.rooms.forEach(function (r) { rooms[r.id] = r; });
  var rp = function (n) { return "Rp " + Number(n).toLocaleString("id-ID"); };
  pairDates(f.checkin, f.checkout);

  function nights() {
    if (!f.checkin.value || !f.checkout.value) return 0;
    return Math.round((Date.parse(f.checkout.value + "T00:00:00Z") - Date.parse(f.checkin.value + "T00:00:00Z")) / 864e5);
  }
  function refresh() {
    var room = rooms[f.room.value] || CFG.rooms[0];
    document.getElementById("co-title").textContent = room.name;
    document.getElementById("co-price").textContent = rp(room.price);
    // only offer guest counts the room can take
    Array.prototype.forEach.call(f.guests.options, function (o) {
      var n = parseInt(o.value, 10);
      o.disabled = o.value === "6+" || n > room.maxGuests;
    });
    if (f.guests.selectedOptions[0] && f.guests.selectedOptions[0].disabled) f.guests.value = String(Math.min(2, room.maxGuests));
    var g = parseInt(f.guests.value, 10), n = nights(), sum = document.getElementById("co-sum");
    if (g > 0 && n > 0) {
      var total = room.price * g * n;
      document.getElementById("co-calc").textContent = rp(room.price) + " × " + g + " " + UI.persons + " × " + n + " " + UI.nights;
      document.getElementById("co-total").textContent = rp(total);
      var dp = document.getElementById("co-dp");
      if (PAY.enabled && PAY.percent < 100) {
        dp.hidden = false;
        dp.textContent = UI.payDeposit.replace("{p}", PAY.percent) + ": " + rp(Math.round(total * PAY.percent / 100)) + " · " + UI.payRest;
      } else dp.hidden = true;
      sum.hidden = false;
    } else sum.hidden = true;
    coBtn.textContent = PAY.enabled ? (PAY.percent < 100 ? UI.payDeposit.replace("{p}", PAY.percent) : UI.payNow) : UI.sendWa;
  }
  ["change", "input"].forEach(function (ev) { coForm.addEventListener(ev, refresh); });

  function openCheckout(roomId) {
    if (roomId && rooms[roomId]) f.room.value = roomId;
    if (qIn.value && !f.checkin.value) f.checkin.value = qIn.value;
    if (qOut.value && !f.checkout.value) f.checkout.value = qOut.value;
    if (qG.value && qG.value !== "6+") f.guests.value = qG.value;
    coForm.hidden = false; coDone.hidden = true; coErr.textContent = "";
    refresh();
    if (dlg.open) dlg.close();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    (f.checkin.value ? f.name : f.checkin).focus();
  }
  function closeCheckout() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }

  document.querySelectorAll("[data-room]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); openCheckout(a.dataset.room); });
  });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg || e.target.closest("[data-close]")) { e.preventDefault(); closeCheckout(); }
  });
  // opened from a link like /?book=laguna (or after a form error without JavaScript)
  if (dlg.hasAttribute("open")) { dlg.removeAttribute("open"); openCheckout(f.room.value); }

  function markInvalid(el) { el.closest(".field").classList.add("is-invalid"); el.focus(); }
  function precheck() {
    coForm.querySelectorAll(".field").forEach(function (x) { x.classList.remove("is-invalid"); });
    if (!f.checkin.value) { markInvalid(f.checkin); return UI.errDates; }
    if (!f.checkout.value) { markInvalid(f.checkout); return UI.errDates; }
    if (f.checkout.value <= f.checkin.value) { markInvalid(f.checkout); return UI.errOrder; }
    if (!f.name.value.trim()) { markInvalid(f.name); return UI.errName; }
    if (!f.contact.value.trim()) { markInvalid(f.contact); return UI.errContact; }
    return "";
  }

  function done(title, text, waUrl, waLabel) {
    coDone.innerHTML = "";
    var h = document.createElement("h3"); h.textContent = title;
    var p = document.createElement("p"); p.textContent = text;
    coDone.append(h, p);
    if (waUrl) {
      var wa = document.createElement("a"); wa.className = "btn btn--cta"; wa.href = waUrl; wa.target = "_blank"; wa.rel = "noopener"; wa.textContent = waLabel || UI.openWa;
      coDone.appendChild(wa);
    }
    var close = document.createElement("button"); close.type = "button"; close.className = "btn btn--soft"; close.textContent = UI.close || "OK"; close.setAttribute("data-close", "");
    coDone.appendChild(close);
    coForm.hidden = true; coDone.hidden = false;
  }

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
  // start fetching the payment script as soon as someone shows interest
  if (PAY.enabled) document.querySelectorAll("[data-room]").forEach(function (a) {
    a.addEventListener("pointerenter", function () { loadSnap().catch(function () {}); }, { once: true });
  });

  coForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = precheck();
    coErr.textContent = msg;
    if (msg) return;
    var data = {};
    new FormData(coForm).forEach(function (v, k) { data[k] = v; });
    data.lang = CFG.lang;
    var label = coBtn.textContent;
    coBtn.disabled = true; coBtn.textContent = PAY.enabled ? UI.loadingPay : UI.sending;
    var finish = function () { coBtn.disabled = false; coBtn.textContent = label; };
    var snapP = PAY.enabled ? loadSnap().catch(function () { return null; }) : Promise.resolve(null);
    fetch(CFG.base + "/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().catch(function () { return { ok: false, error: UI.errServer }; }); })
      .then(function (r) {
        if (!r.ok) { coErr.textContent = r.error || UI.errServer; return finish(); }
        if (r.mode === "pay" && r.token) {
          return snapP.then(function (snap) {
            finish();
            if (!snap) { if (r.redirectUrl) window.location.href = r.redirectUrl; else coErr.textContent = UI.payError; return; }
            closeCheckout();
            snap.pay(r.token, {
              onSuccess: function () { openDone(UI.paidTitle, UI.paidText, r.whatsappUrl, UI.chatWa); },
              onPending: function () { openDone(UI.pendingTitle, UI.pendingText, r.whatsappUrl, UI.chatWa); },
              onError: function () { openDone(UI.payError, "", r.whatsappUrl, UI.chatWa); },
              onClose: function () { openDone(UI.payClosed, "", r.whatsappUrl, UI.chatWa); }
            });
          });
        }
        finish();
        if (r.whatsappUrl) done(UI.sentTitle, UI.sentText, r.whatsappUrl, UI.openWa);
      })
      .catch(function () { coErr.textContent = UI.errServer; finish(); });
  });
  function openDone(title, text, waUrl, waLabel) {
    done(title, text, waUrl, waLabel);
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }
})();
