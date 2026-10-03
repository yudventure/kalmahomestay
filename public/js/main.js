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
  var bookSec = document.getElementById("pesan");
  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
    var r = bookSec.getBoundingClientRect();
    waFloat.classList.toggle("is-hidden", window.scrollY < 400 || (r.top < window.innerHeight && r.bottom > 0));
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
  var bIn = document.getElementById("b-in"), bOut = document.getElementById("b-out"), bG = document.getElementById("b-guests");
  pairDates(qIn, qOut); pairDates(bIn, bOut);

  /* quick form in hero → copy into booking form and scroll there */
  document.getElementById("quick").addEventListener("submit", function (e) {
    e.preventDefault();
    bIn.value = qIn.value; bOut.value = qOut.value; bG.value = qG.value;
    if (qIn.value) bOut.min = qIn.value;
    bookSec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(function () { document.getElementById(bIn.value ? "b-name" : "b-in").focus({ preventScroll: true }); }, 500);
  });

  /* "Book" buttons on room cards preselect the room */
  document.querySelectorAll("[data-room]").forEach(function (a) {
    a.addEventListener("click", function () { document.getElementById("b-room").value = a.dataset.room; });
  });

  /* ---------------------------------------------------------------- hero video tiles
     Videos load only when the page is shown and play only while on screen; skipped for
     reduced-motion and data-saver users (the photo/gradient stays). */
  var clips = document.querySelectorAll(".tile__video");
  var conn = navigator.connection || {};
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || conn.saveData;
  if (clips.length && !calm && "IntersectionObserver" in window) {
    var load = function (v) {
      if (v.dataset.loaded) return;
      v.dataset.loaded = "1";
      [["webm", "video/webm"], ["mp4", "video/mp4"]].forEach(function (s) {
        if (!v.dataset[s[0]]) return;
        var src = document.createElement("source");
        src.src = v.dataset[s[0]]; src.type = s[1];
        v.appendChild(src);
      });
      v.addEventListener("playing", function () { v.classList.add("is-playing"); }, { once: true });
      v.load();
    };
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting && !document.hidden) { load(v); var p = v.play(); if (p) p.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.2 });
    clips.forEach(function (v) { v.muted = true; vio.observe(v); });
    document.addEventListener("visibilitychange", function () {
      clips.forEach(function (v) {
        if (document.hidden) v.pause();
        else if (v.dataset.loaded && v.getBoundingClientRect().bottom > 0) { var p = v.play(); if (p) p.catch(function () {}); }
      });
    });
  }

  /* ---------------------------------------------------------------- hermit crab walking along the wave
     The wave SVG stretches with the screen, so the crab follows the curve's real shape:
     sample the curve once, then place the crab (and tilt it to the slope) on every frame. */
  var shore = document.querySelector(".shore");
  var crab = shore && shore.querySelector(".crab");
  var line = shore && shore.querySelector(".shore__line");
  if (crab && line && line.getTotalLength) {
    var VB_W = 1440, VB_H = 90, pts = [], total = line.getTotalLength();
    for (var i = 0; i <= 240; i++) { var pt = line.getPointAtLength(total * i / 240); pts.push([pt.x, pt.y]); }
    var yAt = function (x) {
      for (var j = 1; j < pts.length; j++) {
        if (pts[j][0] >= x) { var a = pts[j - 1], b = pts[j]; return a[1] + (b[1] - a[1]) * ((x - a[0]) / ((b[0] - a[0]) || 1)); }
      }
      return pts[pts.length - 1][1];
    };
    var pos = 0.14, dir = 1, last = 0, raf = 0, walkLeft = 7, restLeft = 0;
    var place = function () {
      var w = shore.clientWidth, h = shore.clientHeight, x = pos * VB_W;
      var dy = (yAt(Math.min(VB_W, x + 10)) - yAt(Math.max(0, x - 10))) / VB_H * h;
      var ang = Math.atan2(dy, 20 / VB_W * w) * 180 / Math.PI;
      crab.style.transform = "translate(" + (pos * w - 26) + "px," + (yAt(x) / VB_H * h - 37) + "px) rotate(" + ang.toFixed(1) + "deg)" + (dir < 0 ? " scaleX(-1)" : "");
      crab.classList.add("is-on");
    };
    var tick = function (t) {
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (restLeft > 0) {
        restLeft -= dt;
        if (restLeft <= 0) { crab.classList.remove("is-resting"); walkLeft = 5 + Math.random() * 6; }
      } else {
        pos += dir * 26 * dt / (shore.clientWidth || 1);   // about 26 px per second on any screen
        if (pos > 0.95) { pos = 0.95; dir = -1; }
        if (pos < 0.05) { pos = 0.05; dir = 1; }
        walkLeft -= dt;
        if (walkLeft <= 0) { crab.classList.add("is-resting"); restLeft = 1.2 + Math.random() * 2; }
        place();
      }
      raf = requestAnimationFrame(tick);
    };
    var start = function () { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    var stop = function () { cancelAnimationFrame(raf); raf = 0; };
    place();
    window.addEventListener("resize", place);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      crab.classList.add("is-resting");
    } else {
      var seen = false;
      new IntersectionObserver(function (entries) {
        seen = entries[0].isIntersecting;
        if (seen && !document.hidden) start(); else stop();
      }).observe(shore);
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (seen) start(); });
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

  /* ---------------------------------------------------------------- booking form → server → WhatsApp */
  var form = document.getElementById("bform");
  var err = form.querySelector(".bform__err");
  var ok = form.querySelector(".bform__ok");
  var submitBtn = form.querySelector("button[type=submit]");

  function markInvalid(el) { el.closest(".field").classList.add("is-invalid"); el.focus(); }

  /* quick checks before sending (the server validates again) */
  function precheck() {
    var f = form.elements;
    form.querySelectorAll(".field").forEach(function (x) { x.classList.remove("is-invalid"); });
    if (!f.name.value.trim()) { markInvalid(f.name); return UI.errName; }
    if (!f.checkin.value) { markInvalid(f.checkin); return UI.errDates; }
    if (!f.checkout.value) { markInvalid(f.checkout); return UI.errDates; }
    if (f.checkout.value <= f.checkin.value) { markInvalid(f.checkout); return UI.errOrder; }
    return "";
  }

  function send() {
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data.lang = CFG.lang;
    return fetch(CFG.base + "/api/inquiry", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: UI.errServer }; });
    });
  }

  function showSent(r) {
    ok.innerHTML = "";
    var h = document.createElement("h3"); h.textContent = UI.sentTitle;
    var p = document.createElement("p"); p.textContent = UI.sentText;
    var wa = document.createElement("a"); wa.className = "btn btn--cta"; wa.href = r.whatsappUrl; wa.target = "_blank"; wa.rel = "noopener"; wa.textContent = UI.openWa;
    var mail = document.createElement("p"); mail.className = "bform__alt";
    var ml = document.createElement("a"); ml.href = r.mailtoUrl; ml.textContent = UI.orMail; mail.appendChild(ml);
    ok.append(h, p, wa, mail);
    ok.hidden = false;
    form.classList.add("is-sent");
    wa.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = precheck();
    err.textContent = msg;
    if (msg) return;
    var label = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = UI.sending;
    send().then(function (r) {
      if (r.ok && r.whatsappUrl) showSent(r);
      else if (r.ok) form.reset();
      else err.textContent = r.error || UI.errServer;
    }).catch(function () {
      err.textContent = UI.errServer;
    }).then(function () {
      submitBtn.disabled = false; submitBtn.textContent = label;
    });
  });

  /* email link also goes through the server so the inquiry is recorded */
  form.querySelector(".js-mail").addEventListener("click", function (e) {
    e.preventDefault();
    var msg = precheck();
    err.textContent = msg;
    if (msg) return;
    send().then(function (r) {
      if (r.ok && r.mailtoUrl) { showSent(r); window.location.href = r.mailtoUrl; }
      else err.textContent = r.error || UI.errServer;
    }).catch(function () { err.textContent = UI.errServer; });
  });
})();
