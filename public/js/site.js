/* Kalma Raja Ampat · shared behaviour for the inner pages (menu on phones, header shadow). */
(function () {
  "use strict";
  var nav = document.querySelector(".nav");
  var burger = document.querySelector(".nav__burger");
  var menu = document.getElementById("menu");
  if (burger && menu) {
    var close = function () { menu.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); };
    burger.addEventListener("click", function () {
      var open = !menu.classList.contains("is-open");
      menu.classList.toggle("is-open", open); burger.setAttribute("aria-expanded", String(open));
    });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", close); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }
  if (nav) {
    var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
