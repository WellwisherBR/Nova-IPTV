// Nova IPTV — Android bridge
// Reimplementa window.api (antes fornecido pelo preload.js do Electron)
// sobre APIs web + plugin nativo Capacitor (HttpBridge).
(function () {
  var STORE_PREFIX = 'nova_iptv_';
  var VERSION = '1.0.0-android';

  // Cache em memória dos arquivos M3U escolhidos via seletor.
  // A chave é um "pseudo path" salvo no perfil; o valor é o texto do arquivo.
  var pickedFiles = Object.create(null);
  var pickedSeq = 0;

  function cap() {
    return window.Capacitor || null;
  }
  function httpPlugin() {
    var c = cap();
    if (!c || !c.Plugins) return null;
    return c.Plugins.HttpBridge || null;
  }

  function lsGet(key) {
    try { return window.localStorage.getItem(STORE_PREFIX + key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(STORE_PREFIX + key, value); } catch (e) {}
  }
  function lsDel(key) {
    try { window.localStorage.removeItem(STORE_PREFIX + key); } catch (e) {}
  }

  // ---------- armazenamento ----------
  function storeGet(name) {
    var raw = lsGet(name);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function storeSet(name, value) {
    if (value == null) { lsDel(name); return; }
    lsSet(name, JSON.stringify(value));
  }

  // ---------- HTTP ----------
  function httpGet(opts) {
    opts = opts || {};
    var plugin = httpPlugin();
    if (!plugin) {
      return Promise.resolve({ ok: false, status: 0, data: null, error: 'Plugin HttpBridge indisponível' });
    }
    return plugin.httpGet({
      url: opts.url,
      timeout: opts.timeout || 30000
    }).then(function (res) {
      res = res || {};
      var status = res.status || 0;
      var ok = status >= 200 && status < 300;
      var text = res.data || '';
      var data = text;
      if (opts.json) {
        try { data = JSON.parse(text); } catch (e) { data = text; }
      }
      return { ok: ok, status: status, data: data, error: res.error || (ok ? undefined : 'HTTP ' + status) };
    }).catch(function (e) {
      return { ok: false, status: 0, data: null, error: (e && e.message) || 'Falha de rede' };
    });
  }

  // ---------- arquivo M3U ----------
  // Usa um <input type="file"> nativo do WebView. O conteúdo lido fica em
  // memória e também é persistido no localStorage para sobreviver a restarts.
  function openM3uFile() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.m3u,.m3u8,.txt,audio/x-mpegurl,application/x-mpegurl';
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);

      var settled = false;
      function done(val) {
        if (settled) return;
        settled = true;
        try { document.body.removeChild(input); } catch (e) {}
        resolve(val);
      }

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { done(null); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var text = String(reader.result || '');
          pickedSeq += 1;
          var pseudoPath = '/m3u/' + pickedSeq + '/' + (file.name || 'playlist.m3u');
          pickedFiles[pseudoPath] = text;
          try { lsSet('pickedfile_' + pseudoPath, text); } catch (e) {}
          done({ path: pseudoPath });
        };
        reader.onerror = function () { done(null); };
        reader.readAsText(file, 'UTF-8');
      });
      // Cancelamento (navegação fora do seletor)
      input.addEventListener('cancel', function () { done(null); });
      setTimeout(function () { input.click(); }, 0);
    });
  }

  function readText(path) {
    if (path && pickedFiles[path] != null) return Promise.resolve(pickedFiles[path]);
    var cached = lsGet('pickedfile_' + path);
    if (cached != null) {
      pickedFiles[path] = cached;
      return Promise.resolve(cached);
    }
    return Promise.resolve(null);
  }

  // ---------- player nativo (ExoPlayer) ----------
  function nativePlayer() {
    var c = cap();
    if (!c || !c.Plugins) return null;
    return c.Plugins.NativePlayer || null;
  }

  function playLiveNative(url, title, subtitle) {
    var plugin = nativePlayer();
    if (!plugin || !plugin.playLive) return Promise.resolve(false);
    return plugin.playLive({ url: url, title: title || '', subtitle: subtitle || '' })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  // ---------- abrir externo ----------
  function openExternal(url) {
    var plugin = httpPlugin();
    if (plugin && plugin.openExternal) {
      return plugin.openExternal({ url: url }).catch(function () {});
    }
    var c = cap();
    if (c && c.Plugins && c.Plugins.Browser && c.Plugins.Browser.open) {
      return c.Plugins.Browser.open({ url: url }).catch(function () {});
    }
    try { window.open(url, '_blank'); } catch (e) {}
    return Promise.resolve();
  }

  // ---------- API exposta (mesma assinatura do preload.js) ----------
  window.api = {
    storeGet: function (name) { return Promise.resolve(storeGet(name)); },
    storeSet: function (name, value) { storeSet(name, value); return Promise.resolve(); },
    httpGet: httpGet,
    openM3uFile: openM3uFile,
    readText: readText,
    openExternal: openExternal,
    getVersion: function () { return Promise.resolve(VERSION); },
    playLiveNative: playLiveNative
  };
})();
