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
