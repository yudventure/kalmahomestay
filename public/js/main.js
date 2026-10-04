/* Kalma Raja Ampat · homepage behaviour. */
(function () {
  "use strict";

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

  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 8); }
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

  /* ---------------------------------------------------------------- hero search
     The Kalma date picker (datepicker.js) fills check-in and check-out; "Book" opens the booking page
     with the dates and guests already chosen (a plain GET form, so it also works without JavaScript). */
  var quick = document.getElementById("quick");
  if (quick) quick.addEventListener("submit", function (e) {
    var inEl = quick.elements.checkin, outEl = quick.elements.checkout;
    if (inEl && !inEl.value) {
      // no dates yet: open the calendar first instead of an empty booking page
      e.preventDefault();
      var field = document.getElementById("q-in");
      if (field) field.click();
      return;
    }
    if (outEl && !outEl.value) outEl.disabled = true;
  });

  /* ---------------------------------------------------------------- hero video tiles
     The browser starts them itself (autoplay muted) for the fastest start; here we only pause
     them for data-saver visitors, when scrolled away, or in a background tab.
     The site's motion is slow and decorative, so it also plays when Windows "Animation effects" or
     Android "Remove animations" is switched off (prefers-reduced-motion); only smooth scrolling follows it. */
  var clips = Array.prototype.slice.call(document.querySelectorAll(".tile__video"));
  var conn = navigator.connection || {};
  var calm = Boolean(conn.saveData);
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

  /* ---------------------------------------------------------------- Kalma services
     Homestay is the tall (open) card by default; pointing at or focusing another service opens it
     instead, and leaving the row returns to Homestay. */
  var svcGrid = document.getElementById("services");
  if (svcGrid) {
    var cards = Array.prototype.slice.call(svcGrid.querySelectorAll(".svc"));
    var activate = function (card) { cards.forEach(function (c) { c.classList.toggle("is-active", c === card); }); };
    cards.forEach(function (card) {
      card.addEventListener("mouseenter", function () { activate(card); });
      card.addEventListener("focusin", function () { activate(card); });
      card.addEventListener("click", function () { activate(card); });
    });
    svcGrid.addEventListener("mouseleave", function () { if (!svcGrid.contains(document.activeElement)) activate(cards[0]); });
    svcGrid.addEventListener("focusout", function (e) { if (!svcGrid.contains(e.relatedTarget)) activate(cards[0]); });
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

})();
