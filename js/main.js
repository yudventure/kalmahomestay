/* Kalma Raja Ampat — site behavior */
(function () {
  "use strict";

  /* ---- Contact settings: change these to Kalma's real details ---- */
  var WHATSAPP_NUMBER = "6281234567890"; // international format, digits only (placeholder)
  var EMAIL = "hello@kalma-rajaampat.com";

  var doc = document.documentElement;
  doc.classList.add("js");

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- language */
  var ID = {};
  document.querySelectorAll("[data-i18n]").forEach(function (el) { ID[el.dataset.i18n] = el.innerHTML; });
  document.querySelectorAll("[data-i18n-html]").forEach(function (el) { ID[el.dataset.i18nHtml] = el.innerHTML; });
  document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
    var p = el.dataset.i18nAttr.split(":"); ID[p[1]] = el.getAttribute(p[0]);
  });
  var lang = "id";

  function setLang(next) {
    lang = next === "en" ? "en" : "id";
    var dict = lang === "en" ? window.KALMA_EN : ID;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { var v = dict[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { var v = dict[el.dataset.i18nHtml]; if (v != null) el.innerHTML = v; });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var p = el.dataset.i18nAttr.split(":"); var v = dict[p[1]]; if (v != null) el.setAttribute(p[0], v);
    });
    doc.lang = lang;
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
    store("kalma-lang", lang);
  }

  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });
  var saved = store("kalma-lang");
  var browser = (navigator.language || "id").toLowerCase();
  setLang(saved || (browser.indexOf("id") === 0 || browser.indexOf("ms") === 0 ? "id" : "en"));

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

  function fmt(v) {
    if (!v) return "";
    return new Date(v + "T00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

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

  /* ---------------------------------------------------------------- booking → WhatsApp */
  var form = document.getElementById("bform");
  var err = form.querySelector(".bform__err");

  function buildMessage() {
    var t = window.KALMA_UI[lang];
    var f = form.elements;
    var lines = [t.hello, "",
      t.name + ": " + f.name.value.trim(),
      f.country.value.trim() ? t.from + ": " + f.country.value.trim() : null,
      t.dates + ": " + fmt(f.checkin.value) + " – " + fmt(f.checkout.value),
      t.guests + ": " + f.guests.value,
      t.room + ": " + (f.room.value || t.any),
      f.msg.value.trim() ? t.note + ": " + f.msg.value.trim() : null];
    return lines.filter(function (l) { return l !== null; }).join("\n");
  }

  function validate() {
    var t = window.KALMA_UI[lang], f = form.elements;
    form.querySelectorAll(".field").forEach(function (x) { x.classList.remove("is-invalid"); });
    if (!f.name.value.trim()) { f.name.closest(".field").classList.add("is-invalid"); f.name.focus(); return t.errName; }
    if (!f.checkin.value || !f.checkout.value) {
      (f.checkin.value ? f.checkout : f.checkin).closest(".field").classList.add("is-invalid");
      (f.checkin.value ? f.checkout : f.checkin).focus(); return t.errDates;
    }
    if (f.checkout.value <= f.checkin.value) { f.checkout.closest(".field").classList.add("is-invalid"); f.checkout.focus(); return t.errOrder; }
    return "";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = validate();
    err.textContent = msg;
    if (msg) return;
    window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(buildMessage()), "_blank", "noopener");
  });

  form.querySelector(".js-mail").addEventListener("click", function (e) {
    var msg = validate();
    err.textContent = msg;
    if (msg) { e.preventDefault(); return; }
    this.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(window.KALMA_UI[lang].subject + " — Kalma") + "&body=" + encodeURIComponent(buildMessage());
  });

  document.querySelectorAll(".js-wa-link").forEach(function (a) { a.href = "https://wa.me/" + WHATSAPP_NUMBER; a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll(".js-year").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
