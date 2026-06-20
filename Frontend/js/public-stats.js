(function () {
  var INR_PER_USD = 1 / 83;

  function formatCompactCount(n) {
    var num = Number(n);
    if (Number.isNaN(num) || num < 0) num = 0;
    if (num >= 1000000) {
      var m = num / 1000000;
      return (m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")) + "M+";
    }
    if (num >= 1000) {
      return Math.floor(num / 1000) + "K+";
    }
    return Math.round(num) + "+";
  }

  function formatSavingsUsd(amountInr) {
    var inr = Number(amountInr);
    if (Number.isNaN(inr) || inr < 0) inr = 0;
    var usd = inr * INR_PER_USD;
    if (usd >= 1000000) {
      var m = usd / 1000000;
      return "$" + (m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")) + "M";
    }
    if (usd >= 1000) {
      return "$" + Math.round(usd / 1000) + "K";
    }
    if (usd >= 1) {
      return "$" + Math.round(usd);
    }
    return "$0";
  }

  window.formatCompactCount = formatCompactCount;
  window.formatSavingsUsd = formatSavingsUsd;

  window.loadPublicStats = function (options) {
    options = options || {};
    var get =
      window.apiGetJson ||
      function (path) {
        var base = window.API_BASE || "";
        return fetch(base + path).then(function (res) {
          return res.json();
        });
      };

    return get("/stats")
      .then(function (stats) {
        if (!stats) return;

        var productsEl = document.querySelector(options.productsSelector || "[data-stat='products']");
        var storesEl = document.querySelector(options.storesSelector || "[data-stat='stores']");
        var savingsEl = document.querySelector(options.savingsSelector || "[data-stat='savings']");
        var usersEl = document.querySelector(options.usersSelector || "[data-stat='users']");

        if (productsEl) productsEl.textContent = formatCompactCount(stats.productCount);
        if (storesEl) storesEl.textContent = formatCompactCount(stats.storeCount);
        if (savingsEl) savingsEl.textContent = formatSavingsUsd(stats.totalSavingsInr);
        if (usersEl) usersEl.textContent = formatCompactCount(stats.happyUsers || stats.messageCount || 0);
      })
      .catch(function () {
        /* keep static fallback text */
      });
  };
})();
