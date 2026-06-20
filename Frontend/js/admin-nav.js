(function () {
  function updateBadgeForLink(hrefPart, value) {
    document.querySelectorAll('.nav-link[href*="' + hrefPart + '"] .nav-link-badge').forEach(function (badge) {
      badge.textContent = String(value);
    });
  }

  window.syncAdminNavBadges = function () {
    if (!window.getAdminToken || !window.getAdminToken()) return Promise.resolve();

    var get =
      window.apiGetJson ||
      function (path) {
        return window.apiFetch(path, { method: "GET" }).then(function (res) {
          return res.json();
        });
      };

    return get("/admin/summary")
      .then(function (summ) {
        if (!summ) return;
        updateBadgeForLink("products.html", summ.productCount != null ? summ.productCount : 0);
        updateBadgeForLink("stores.html", summ.storeCount != null ? summ.storeCount : 0);
        updateBadgeForLink("messages.html", summ.messageCount != null ? summ.messageCount : 0);
      })
      .catch(function () {
        /* sidebar keeps fallback numbers */
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.syncAdminNavBadges();
    });
  } else {
    window.syncAdminNavBadges();
  }
})();
