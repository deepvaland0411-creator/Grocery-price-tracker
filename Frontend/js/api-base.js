(function () {

  var port = "5000";

  var host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {

    window.API_BASE = "http://" + host + ":" + port + "/api";

  } else {

    window.API_BASE = window.API_BASE || "http://127.0.0.1:" + port + "/api";

  }



  var healthHint =

    "Open http://" + host + ":" + port + "/health in your browser — it should show {\"ok\":true,...}.";



  function redirectToAdminLogin() {

    try {

      localStorage.removeItem("adminToken");

      localStorage.removeItem("adminLoggedIn");

      localStorage.removeItem("adminId");

    } catch (e) {}

    try {

      window.location.href = new URL("../user/login.html", window.location.href).href;

    } catch (e2) {

      window.location.href = "../user/login.html";

    }

  }



  /**

   * GET admin token (JWT) for Authorization header.

   */

  window.getAdminToken = function () {

    try {

      return localStorage.getItem("adminToken") || "";

    } catch (e) {

      return "";

    }

  };



  /**

   * fetch() to API_BASE + path with Bearer token when present.

   * @param {string} path e.g. "/admin/products"

   */

  window.apiFetch = function (path, init) {

    init = init || {};

    var headers = {};

    if (init.headers) {

      if (init.headers instanceof Headers) {

        init.headers.forEach(function (v, k) {

          headers[k] = v;

        });

      } else {

        Object.keys(init.headers).forEach(function (k) {

          headers[k] = init.headers[k];

        });

      }

    }

    var token = window.getAdminToken();

    if (token) {

      headers["Authorization"] = "Bearer " + token;

    }

    init.headers = headers;

    var base = window.API_BASE || "";

    var url = base + (path.charAt(0) === "/" ? path : "/" + path);

    return fetch(url, init).then(function (res) {

      if (res.status === 401 && window.getAdminToken()) {

        redirectToAdminLogin();

        return Promise.reject(new Error("Session expired. Please sign in again."));

      }

      return res;

    });

  };



  /**

   * GET JSON from the API (with admin auth when token exists).

   */

  window.apiGetJson = function (path) {

    return window.apiFetch(path, { method: "GET" }).then(function (res) {

      return res.text().then(function (text) {

        var data;

        try {

          data = text ? JSON.parse(text) : null;

        } catch (e) {

          throw new Error(

            "Backend did not return JSON (server may be off or wrong URL). " + healthHint

          );

        }

        if (!res.ok) {

          var msg = data && data.message ? data.message : "HTTP " + res.status;

          throw new Error(msg);

        }

        return data;

      });

    });

  };



  /** Stored in Settings; amounts in API/DB are always INR. */

  window.getDisplayCurrency = function () {

    try {

      return localStorage.getItem("adminCurrency") || "INR";

    } catch (e) {

      return "INR";

    }

  };



  var INR_PER_USD = 1 / 83;



  /** Format an amount stored as INR for display (Rs. or $). */

  window.formatMoney = function (amountInr) {

    var n = Number(amountInr);

    if (Number.isNaN(n)) n = 0;

    if (window.getDisplayCurrency() === "USD") {

      return "$" + (n * INR_PER_USD).toFixed(2);

    }

    return "Rs. " + Math.round(n);

  };



  /** Chart axis / short numeric label */

  window.formatMoneyShort = function (amountInr) {

    var n = Number(amountInr);

    if (Number.isNaN(n)) n = 0;

    if (window.getDisplayCurrency() === "USD") {

      return "$" + (n * INR_PER_USD).toFixed(0);

    }

    return "Rs." + Math.round(n);

  };

})();

