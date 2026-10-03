/* Survey: enforce "choose up to N" on checkbox groups (the server enforces it too). */
(function () {
  "use strict";
  document.querySelectorAll(".sv__group[data-max]").forEach(function (group) {
    var max = Number(group.dataset.max);
    var boxes = group.querySelectorAll('input[type="checkbox"]');
    function update() {
      var n = 0;
      boxes.forEach(function (b) { if (b.checked) n += 1; });
      boxes.forEach(function (b) { b.disabled = !b.checked && n >= max; });
    }
    boxes.forEach(function (b) { b.addEventListener("change", update); });
    update();
  });
  var first = document.querySelector(".sv__q.is-invalid");
  if (first) first.scrollIntoView({ block: "center" });
})();
