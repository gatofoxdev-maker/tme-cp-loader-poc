define([], function () {
  var SSO_RENDER_WAIT_MS = 20000;
  var MODAL_PROBE_WAIT_MS = 6000;
  var DEFAULT_STUB_TOKEN = "stub-email-token";

  function normalizeString(v) {
    return (v == null ? "" : String(v)).trim();
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function upsertSpeechBalloon(title, statusText, isError) {
    var balloonId = "cp-direct-modal-test-balloon";
    var titleId = "cp-direct-modal-test-title";
    var statusId = "cp-direct-modal-test-status";
    var balloon = document.getElementById(balloonId);

    if (!balloon) {
      balloon = document.createElement("div");
      balloon.id = balloonId;
      balloon.style.position = "fixed";
      balloon.style.right = "22px";
      balloon.style.bottom = "24px";
      balloon.style.maxWidth = "560px";
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
      titleNode.textContent = title || "Direct modal smoke test";
    }
    if (statusNode) {
      statusNode.textContent = statusText || "";
      statusNode.style.color = isError ? "#ffafaf" : "#7cffb4";
    }
    if (balloon) {
      balloon.style.borderColor = isError ? "#ff8080" : "#5aa0ff";
    }
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

  function readRequestedToken() {
    var fromSearch = safeCall(function () {
      return new URLSearchParams(window.location.search || "");
    }, null);
    if (!fromSearch) {
      return "";
    }
    return normalizeString(
      fromSearch.get("modalEmailToken") ||
      fromSearch.get("emailToken") ||
      fromSearch.get("token")
    );
  }

  async function tryRenderChangeEmail(ssoConfig, token, label) {
    var contract = { contractKey: "changeEmail" };
    if (token) {
      contract.emailToken = token;
    }

    upsertSpeechBalloon(
      "Direct modal smoke test",
      "Attempt: " + label + "\n" +
      "token=" + (token ? token : "<empty>"),
      false
    );

    ssoConfig.render(
      contract,
      { topic: "sso.email.change.requested" }
    );

    var visible = await waitForPasswordInputPresence(MODAL_PROBE_WAIT_MS);
    return {
      ok: visible,
      label: label,
      token: token
    };
  }

  async function executePoC() {
    ensureSsoWrapperContainer();
    var configUrl = getSsoConfigurationUrl();
    var ssoConfig = await loadSsoConfigurationModule(configUrl);

    if (!ssoConfig || typeof ssoConfig.render !== "function") {
      throw new Error("sso_config_render_not_available");
    }

    var requested = readRequestedToken();
    var stub = requested || DEFAULT_STUB_TOKEN;

    var attempts = [
      { token: stub, label: requested ? "provided_token" : "stub_token" },
      { token: "", label: "no_token" }
    ];

    var seen = {};
    for (var i = 0; i < attempts.length; i++) {
      var key = attempts[i].label + "::" + attempts[i].token;
      if (seen[key]) {
        continue;
      }
      seen[key] = true;

      var attemptResult = await tryRenderChangeEmail(ssoConfig, attempts[i].token, attempts[i].label);
      if (attemptResult.ok) {
        var msg =
          "Modal opened successfully.\n" +
          "attempt=" + attemptResult.label + "\n" +
          "token=" + (attemptResult.token ? attemptResult.token : "<empty>") + "\n" +
          "sso_config=" + configUrl;
        upsertSpeechBalloon("Direct modal smoke test", msg, false);
        window.__CP_DIRECT_MODAL_TEST_RESULT__ = {
          ok: true,
          attempt: attemptResult.label,
          tokenUsed: attemptResult.token,
          ssoConfigUrl: configUrl
        };
        return;
      }
    }

    upsertSpeechBalloon(
      "Direct modal smoke test",
      "Modal input not detected after all attempts.\n" +
      "Tried: stub/provided token and no token.\n" +
      "sso_config=" + configUrl,
      true
    );
    window.__CP_DIRECT_MODAL_TEST_RESULT__ = {
      ok: false,
      reason: "password_input_not_detected",
      ssoConfigUrl: configUrl
    };
  }

  executePoC().catch(function (err) {
    var msg = String(err && err.message ? err.message : err);
    upsertSpeechBalloon("Direct modal smoke test", msg, true);
    window.__CP_DIRECT_MODAL_TEST_ERROR__ = msg;
  });

  return {
    version: "0.1.0-direct-change-email-modal-smoketest",
    render: function () {
      return executePoC();
    }
  };
});
