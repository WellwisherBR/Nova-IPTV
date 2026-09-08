const backend = window.api;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="20" height="20" rx="2.5"/><path d="M7 2v20M17 2v20M2 12h20"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>'
};

const state = {
  profiles: [],
  favorites: [],
  settings: {},
  profile: null,
  data: null,
  view: 'home',
  content: null,
  renderLimit: 300,
  lastPlay: null,
  playerOpen: false,
  progress: {},
  currentTrack: null,
  resumeAt: 0,
  lastTrackSave: 0
};

let hlsInstance = null;

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icon = type === 'success' ? ICON.check : type === 'error' ? ICON.alert : ICON.alert;
  el.innerHTML = icon + '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

function showLoading(msg) {
  $('#loading-msg').textContent = msg || 'Carregando...';
  $('#loading').classList.remove('hidden');
}

function hideLoading() {
  $('#loading').classList.add('hidden');
}

function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modal-backdrop').classList.remove('hidden');
  $$('#modal [data-close]').forEach((b) => (b.onclick = closeModal));
}

function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  $('#modal').innerHTML = '';
}

function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    openModal(
      '<div class="modal-card confirm">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
        '<div class="modal-body" style="color:var(--muted);font-size:13.5px;line-height:1.6">' + esc(msg) + '</div>' +
        '<div class="modal-foot"><button class="btn ghost" id="cf-no">Cancelar</button><button class="btn danger" id="cf-yes" style="background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.4)">Excluir</button></div>' +
      '</div>'
    );
    $('#cf-no').onclick = () => { closeModal(); resolve(false); };
    $('#cf-yes').onclick = () => { closeModal(); resolve(true); };
  });
}

async function loadStores() {
  state.profiles = (await backend.storeGet('profiles')) || [];
  state.favorites = (await backend.storeGet('favorites')) || [];
  state.settings = (await backend.storeGet('settings')) || {};
  state.progress = (await backend.storeGet('progress')) || {};
}

const saveProfiles = () => backend.storeSet('profiles', state.profiles);
const saveFavorites = () => backend.storeSet('favorites', state.favorites);
const saveSettings = () => backend.storeSet('settings', state.settings);
const saveProgressStore = () => backend.storeSet('progress', state.progress);

function tc(sec) {
  const s = Math.floor(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

function saveProgressEntry(entry) {
  state.progress[entry.key] = entry;
  saveProgressStore();
}

function removeProgress(key, silent) {
  if (!(key in state.progress)) return;
  delete state.progress[key];
  saveProgressStore();
  if (!silent && state.view === 'home') renderHome();
}

function persistTrack() {
  const t = state.currentTrack;
  if (!t || !t.position || t.position < 15) return;
  const pct = t.duration ? t.position / t.duration : 0;
  if (pct >= 0.98) {
    removeProgress(t.key, true);
    return;
  }
  saveProgressEntry({
    key: t.key,
    kind: t.kind,
    profileId: t.profileId,
    name: t.name,
    image: t.image,
    position: Math.floor(t.position),
    duration: Math.floor(t.duration || 0),
    updatedAt: Date.now(),
    src: t.src
  });
}

function urlFromSrc(src, profile) {
  if (!src) return null;
  if (src.type === 'url') return src.url;
  if (!profile || profile.type !== 'xtream') return null;
  const s = normalizeServer(profile.server);
  const auth = encodeURIComponent(profile.username) + '/' + encodeURIComponent(profile.password);
  if (src.type === 'movie') return `${s}/movie/${auth}/${src.id}.${src.ext || 'mp4'}`;
  if (src.type === 'episode') return `${s}/series/${auth}/${src.epId}.${src.ext || 'mp4'}`;
  return null;
}

function trackForItem(item) {
  if (!state.profile) return null;
  let src;
  if (item.url) src = { type: 'url', url: item.url };
  else if (item.kind === 'vod') src = { type: 'movie', id: item.id, ext: item.ext || 'mp4' };
  else src = { type: 'url', url: '' };
  return {
    key: favKey(state.profile.id, item.kind, item.id),
    kind: item.kind,
    profileId: state.profile.id,
    name: item.name,
    image: item.image,
    src
  };
}

function playProgressEntry(entry) {
  const p = state.profiles.find((x) => x.id === entry.profileId);
  const url = urlFromSrc(entry.src, p);
  if (!url) {
    toast('Não foi possível continuar: item ou perfil indisponível.', 'error');
    return;
  }
  const track = { key: entry.key, kind: entry.kind, profileId: entry.profileId, name: entry.name, image: entry.image, src: entry.src };
  playUrl(url, entry.name, entry.kind === 'series' ? 'Série' : 'Filme', null, { track, resume: entry.position });
}

function promptResume(entry, onFresh) {
  openModal(
    '<div class="modal-card confirm">' +
      '<div class="modal-head"><h3>Continuar assistindo?</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
      '<div class="modal-body">' +
        '<div style="font-weight:700;margin-bottom:6px">' + esc(entry.name) + '</div>' +
        '<div style="color:var(--muted);font-size:13px">Você parou em <b style="color:var(--text)">' + tc(entry.position) + '</b>' + (entry.duration ? ' de ' + tc(entry.duration) : '') + '.</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn ghost" id="rs-fresh">Do início</button>' +
        '<button class="btn primary" id="rs-cont">Continuar de onde parou</button>' +
      '</div>' +
    '</div>'
  );
  $('#rs-cont').onclick = () => { closeModal(); playProgressEntry(entry); };
  $('#rs-fresh').onclick = () => { closeModal(); removeProgress(entry.key, true); onFresh && onFresh(); };
}

function playVodSmart(item) {
  const key = state.profile ? favKey(state.profile.id, 'vod', item.id) : null;
  const entry = key ? state.progress[key] : null;
  if (entry && entry.position > 30) {
    promptResume(entry, () => playItem(item));
    return;
  }
  playItem(item);
}

async function fetchJson(url, timeout) {
  const r = await backend.httpGet({ url, json: true, timeout });
  if (!r.ok) throw new Error(r.error || 'HTTP ' + r.status);
  return r.data;
}

async function fetchText(url, timeout) {
  const r = await backend.httpGet({ url, timeout: timeout || 60000 });
  if (!r.ok) throw new Error(r.error || 'HTTP ' + r.status);
  return r.data;
}

function normalizeServer(server) {
  let s = String(server || '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

function xtreamBase(p) {
  return normalizeServer(p.server) + '/player_api.php?username=' + encodeURIComponent(p.username) + '&password=' + encodeURIComponent(p.password);
}

function organize(items, apiCats) {
  const counts = {};
  for (const it of items) counts[it.category] = (counts[it.category] || 0) + 1;
  const categories = [];
  const seen = new Set();
  for (const c of apiCats || []) {
    if (counts[c.id]) {
      categories.push({ id: c.id, name: c.name, count: counts[c.id] });
      seen.add(c.id);
    }
  }
  for (const k of Object.keys(counts)) {
    if (!seen.has(k)) categories.push({ id: k, name: k || 'Sem categoria', count: counts[k] });
  }
  return { categories, items };
}

async function loadXtreamData(p) {
  const base = xtreamBase(p);
  const info = await fetchJson(base, 20000);
  if (!info || !info.user_info) throw new Error('Resposta inválida do servidor. Verifique a URL.');
  const auth = info.user_info.auth;
  if (!(auth === 1 || auth === '1' || auth === true)) throw new Error('Autenticação falhou. Verifique usuário e senha.');

  const safe = (a) => (Array.isArray(a) ? a : []);
  const [lc, vc, sc, ls, vs, ss] = await Promise.all([
    fetchJson(base + '&action=get_live_categories').catch(() => []),
    fetchJson(base + '&action=get_vod_categories').catch(() => []),
    fetchJson(base + '&action=get_series_categories').catch(() => []),
    fetchJson(base + '&action=get_live_streams', 60000).catch(() => []),
    fetchJson(base + '&action=get_vod_streams', 60000).catch(() => []),
    fetchJson(base + '&action=get_series', 60000).catch(() => [])
  ]);

  const catMap = (arr) => safe(arr).map((c) => ({ id: String(c.category_id), name: c.category_name || 'Sem categoria' }));

  const liveItems = safe(ls).map((s) => ({
    id: String(s.stream_id), name: s.name || 'Sem nome', image: s.stream_icon || '', category: String(s.category_id), kind: 'live'
  }));
  const vodItems = safe(vs).map((s) => ({
    id: String(s.stream_id), name: s.name || 'Sem nome', image: s.stream_icon || '', category: String(s.category_id), kind: 'vod', ext: s.container_extension || 'mp4'
  }));
  const seriesItems = safe(ss).map((s) => ({
    id: String(s.series_id), name: s.name || 'Sem nome', image: s.image || s.cover || '', category: String(s.category_id), kind: 'series'
  }));

  return {
    live: organize(liveItems, catMap(lc)),
    vod: organize(vodItems, catMap(vc)),
    series: organize(seriesItems, catMap(sc)),
    meta: {
      user: info.user_info.username,
      expDate: info.user_info.exp_date ? Number(info.user_info.exp_date) * 1000 : null,
      host: (info.server_info && info.server_info.url) || p.server
    }
  };
}

function parseM3U(text) {
  const out = { live: [], vod: [], series: [] };
  const lines = String(text).split(/\r?\n/);
  const reAttr = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let pending = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const comma = line.lastIndexOf(',');
      const name = (comma >= 0 ? line.slice(comma + 1) : '').trim() || 'Sem nome';
      const attrs = {};
      let m;
      reAttr.lastIndex = 0;
      while ((m = reAttr.exec(line)) !== null) attrs[m[1].toLowerCase()] = m[2];
      pending = { name, logo: attrs['tvg-logo'] || '', group: attrs['group-title'] || 'Sem categoria' };
    } else if (line.startsWith('#')) {
      continue;
    } else if (pending) {
      const url = line;
      const g = (pending.group || '').toLowerCase();
      let kind = 'live';
      if (/(serie|séries|série|shows)/.test(g) || /\/series\//i.test(url)) kind = 'series';
      else if (/(movie|filme|filmes|cinema|vod)/.test(g) || /\/movie\//i.test(url)) kind = 'vod';
      out[kind].push({
        id: kind.charAt(0) + (out[kind].length + 1),
        name: pending.name,
        image: pending.logo,
        category: pending.group,
        kind,
        url
      });
      pending = null;
    }
  }

  return {
    live: organize(out.live, []),
    vod: organize(out.vod, []),
    series: organize(out.series, []),
    meta: null
  };
}

async function loadM3UProfile(p) {
  let text;
  if (p.source === 'file') {
    text = await backend.readText(p.path);
    if (text == null) throw new Error('Arquivo da playlist não encontrado: ' + p.path);
  } else {
    text = await fetchText(p.url, 90000);
  }
  if (!text || !text.includes('#EXTINF')) throw new Error('Conteúdo M3U inválido.');
  return parseM3U(text);
}

function renderProfileSelect() {
  const sel = $('#profile-select');
  sel.innerHTML = state.profiles.length
    ? state.profiles.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
    : '<option value="">Nenhum perfil</option>';
  sel.value = state.profile ? state.profile.id : '';
}

function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.add('hidden'));
  $('#screen-' + name).classList.remove('hidden');
  state.view = name;
}

function goHome() {
  renderHome();
  showScreen('home');
}

function goProfiles() {
  renderProfiles();
  showScreen('profiles');
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function renderHome() {
  $('#home-greeting').textContent = greeting();
  $('#home-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const d = state.data;
  const nl = d ? d.live.items.length : 0;
  const nv = d ? d.vod.items.length : 0;
  const ns = d ? d.series.items.length : 0;
  $('#count-live').textContent = nl.toLocaleString('pt-BR') + ' canais';
  $('#count-vod').textContent = nv.toLocaleString('pt-BR') + ' filmes';
  $('#count-series').textContent = ns.toLocaleString('pt-BR') + ' séries';
  $('#count-fav').textContent = state.favorites.length + ' itens';

  const info = $('#home-profile-info');
  if (state.profile) {
    let lines = '<b>' + esc(state.profile.name) + '</b> · ' + (state.profile.type === 'xtream' ? 'Xtream Codes' : 'Playlist M3U');
    if (d && d.meta && d.meta.expDate) lines += '<br>Expira em: <span class="accent">' + fmtDate(d.meta.expDate) + '</span>';
    if (state.profile.updatedAt) lines += '<br>Atualizado às ' + fmtTime(state.profile.updatedAt);
    info.innerHTML = lines;
    info.classList.remove('hidden');
  } else {
    info.innerHTML = 'Nenhum perfil ativo';
  }

  const contList = Object.values(state.progress).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 15);
  const contWrap = $('#home-cont-wrap');
  if (contList.length) {
    contWrap.classList.remove('hidden');
    $('#home-cont-row').innerHTML = contList.map(contCardHtml).join('');
    $('#home-cont-row').querySelectorAll('[data-cont]').forEach((card) => {
      card.addEventListener('click', () => {
        const entry = state.progress[card.dataset.cont];
        if (entry) playProgressEntry(entry);
      });
    });
    $('#home-cont-row').querySelectorAll('[data-contdel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeProgress(btn.dataset.contdel, true);
        renderHome();
      });
    });
  } else {
    contWrap.classList.add('hidden');
  }

  const favs = state.favorites.slice(0, 20);
  const wrap = $('#home-favs-wrap');
  if (favs.length) {
    wrap.classList.remove('hidden');
    $('#home-favs-row').innerHTML = favs.map((f) => posterCardForFav(f)).join('');
    bindCardEvents($('#home-favs-row'));
  } else {
    wrap.classList.add('hidden');
  }
}

function imgTag(src, fallbackIcon) {
  if (!src) return fallbackIcon;
  return `<img loading="lazy" src="${esc(src)}" onerror="this.style.display='none'">`;
}

function favKey(profileId, kind, id) {
  return profileId + ':' + kind + ':' + id;
}

function isFav(key) {
  return state.favorites.some((f) => f.key === key);
}

function toggleFavorite(entry) {
  const idx = state.favorites.findIndex((f) => f.key === entry.key);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    toast('Removido dos favoritos', 'info');
  } else {
    state.favorites.unshift(entry);
    toast('Adicionado aos favoritos', 'success');
  }
  saveFavorites();
  renderCurrent();
}

function favEntryFromItem(item) {
  return {
    key: favKey(state.profile.id, item.kind, item.id),
    profileId: state.profile.id,
    kind: item.kind,
    name: item.name,
    image: item.image,
    item: Object.assign({}, item)
  };
}

function favBtnHtml(key, entryJson) {
  const faved = isFav(key);
  return `<button class="fav-btn ${faved ? 'faved' : ''}" data-fav="${esc(entryJson)}" title="Favorito">${ICON.heart}</button>`;
}

function posterCardHtml(item, opts = {}) {
  const key = state.profile ? favKey(state.profile.id, item.kind, item.id) : '';
  const entry = state.profile ? esc(JSON.stringify(favEntryFromItem(item))) : '';
  return (
    '<div class="card-poster" data-item="' + esc(JSON.stringify(item)) + '">' +
      (opts.badge ? `<span class="badge-kind ${item.kind}">${item.kind === 'vod' ? 'Filme' : 'Série'}</span>` : '') +
      (state.profile && item.kind !== 'live' ? favBtnHtml(key, entry) : '') +
      '<div class="poster-img">' + imgTag(item.image, item.kind === 'series' ? ICON.tv : ICON.film) + '</div>' +
      '<div class="play-overlay"><div class="play-circle">' + ICON.play + '</div></div>' +
      '<div class="card-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
      (opts.meta ? `<div class="card-meta">${opts.meta}</div>` : '') +
    '</div>'
  );
}

function posterCardForFav(f) {
  const item = f.item;
  const entry = esc(JSON.stringify(f));
  return (
    '<div class="card-poster" data-favitem="' + entry + '">' +
      `<span class="badge-kind ${f.kind}">${f.kind === 'vod' ? 'Filme' : 'Série'}</span>` +
      favBtnHtml(f.key, entry) +
      '<div class="poster-img">' + imgTag(f.image, f.kind === 'series' ? ICON.tv : ICON.film) + '</div>' +
      '<div class="play-overlay"><div class="play-circle">' + ICON.play + '</div></div>' +
      '<div class="card-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
    '</div>'
  );
}

function contCardHtml(entry) {
  const pct = entry.duration ? Math.min(100, Math.round((entry.position / entry.duration) * 100)) : 0;
  return (
    '<div class="card-poster" data-cont="' + esc(entry.key) + '">' +
      '<button class="fav-btn cont-remove" data-contdel="' + esc(entry.key) + '" title="Remover da lista">' + ICON.x + '</button>' +
      '<div class="poster-img">' + imgTag(entry.image, entry.kind === 'series' ? ICON.tv : ICON.film) + '</div>' +
      '<div class="play-overlay"><div class="play-circle">' + ICON.play + '</div></div>' +
      '<div class="card-name" title="' + esc(entry.name) + '">' + esc(entry.name) + '</div>' +
      '<div class="cont-progress"><div style="width:' + pct + '%"></div></div>' +
      '<div class="card-meta">Parado em ' + tc(entry.position) + '</div>' +
    '</div>'
  );
}

function liveCardHtml(item, catName) {
  return (
    '<div class="card-live" data-item="' + esc(JSON.stringify(item)) + '">' +
      '<div class="live-logo">' + imgTag(item.image, ICON.tv) + '</div>' +
      '<div style="min-width:0"><div class="live-name">' + esc(item.name) + '</div>' +
      (catName ? '<div class="live-cat">' + esc(catName) + '</div>' : '') + '</div>' +
    '</div>'
  );
}

function bindCardEvents(container) {
  container.querySelectorAll('.fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const entry = JSON.parse(btn.dataset.fav);
        toggleFavorite(entry);
      } catch {}
    });
  });
  container.querySelectorAll('[data-item]').forEach((card) => {
    card.addEventListener('click', () => {
      try {
        const item = JSON.parse(card.dataset.item);
        if (item.kind === 'series' && !item.url) openSeriesDetail(item);
        else if (item.kind === 'vod') playVodSmart(item);
        else playItem(item);
      } catch {}
    });
  });
  container.querySelectorAll('[data-favitem]').forEach((card) => {
    card.addEventListener('click', () => {
      try {
        const f = JSON.parse(card.dataset.favitem);
        openFavorite(f);
      } catch {}
    });
  });
}

function openFavorite(f) {
  if (f.kind === 'series') {
    openSeriesDetail(f.item, f.profileId);
    return;
  }
  const p = state.profiles.find((x) => x.id === f.profileId);
  if (!f.item.url && (!p || p.type !== 'xtream')) {
    toast('O perfil deste favorito não existe mais.', 'error');
    return;
  }
  const track = {
    key: f.key,
    kind: 'vod',
    profileId: f.profileId,
    name: f.name,
    image: f.image,
    src: f.item.url ? { type: 'url', url: f.item.url } : { type: 'movie', id: f.item.id, ext: f.item.ext || 'mp4' }
  };
  const doPlay = () => {
    const url = f.item.url
      ? f.item.url
      : normalizeServer(p.server) + '/movie/' + encodeURIComponent(p.username) + '/' + encodeURIComponent(p.password) + '/' + f.item.id + '.' + (f.item.ext || 'mp4');
    playUrl(url, f.name, 'Filme', null, { track });
  };
  const entry = state.progress[f.key];
  if (entry && entry.position > 30) {
    promptResume(entry, doPlay);
    return;
  }
  doPlay();
}

function playItem(item) {
  const track = item.kind === 'live' ? null : trackForItem(item);
  if (item.url) {
    playUrl(item.url, item.name, item.kind === 'live' ? 'TV ao Vivo' : item.kind === 'vod' ? 'Filme' : 'Série', null, { track });
    return;
  }
  const p = state.profile;
  if (!p || p.type !== 'xtream') {
    toast('Não foi possível montar a URL do stream.', 'error');
    return;
  }
  const s = normalizeServer(p.server);
  const auth = encodeURIComponent(p.username) + '/' + encodeURIComponent(p.password);
  let url;
  if (item.kind === 'live') url = `${s}/live/${auth}/${item.id}.m3u8`;
  else if (item.kind === 'vod') url = `${s}/movie/${auth}/${item.id}.${item.ext || 'mp4'}`;
  else url = `${s}/series/${auth}/${item.id}.mp4`;
  playUrl(url, item.name, item.kind === 'live' ? 'TV ao Vivo' : item.kind === 'vod' ? 'Filme' : 'Série', null, { track });
}

const TYPE_LABEL = { live: 'TV ao Vivo', vod: 'Filmes', series: 'Séries', favorites: 'Favoritos' };

function openContent(type) {
  if (type !== 'favorites' && (!state.data || !state.profile)) {
    toast('Carregue um perfil primeiro.', 'error');
    return;
  }
  state.content = { type, category: null, query: '' };
  state.renderLimit = 300;
  $('#search').value = '';
  renderContent();
  showScreen('content');
}

function currentItems() {
  const c = state.content;
  if (!c) return [];
  if (c.type === 'favorites') return state.favorites;
  if (!state.data) return [];
  return state.data[c.type].items;
}

function filteredItems() {
  const c = state.content;
  let items = currentItems();
  if (c.type === 'favorites') {
    if (c.category) items = items.filter((f) => f.kind === c.category);
  } else if (c.category) {
    items = items.filter((it) => it.category === c.category);
  }
  if (c.query) {
    const q = c.query.toLowerCase();
    items = items.filter((it) => (it.name || '').toLowerCase().includes(q));
  }
  return items;
}

function renderContent() {
  const c = state.content;
  if (!c) return;
  $('#sidebar-title').textContent = c.type === 'favorites' ? 'Filtrar' : 'Categorias';
  $('#content-title').textContent = TYPE_LABEL[c.type];

  const list = $('#cat-list');
  if (c.type === 'favorites') {
    const chips = [
      { id: null, name: 'Todos', count: state.favorites.length },
      { id: 'vod', name: 'Filmes', count: state.favorites.filter((f) => f.kind === 'vod').length },
      { id: 'series', name: 'Séries', count: state.favorites.filter((f) => f.kind === 'series').length }
    ];
    list.innerHTML = chips.map((ch) => catItemHtml(ch)).join('');
    $('#sidebar-foot').textContent = state.favorites.length + ' favoritos salvos';
  } else {
    const section = state.data[c.type];
    const all = { id: null, name: 'Todos', count: section.items.length };
    list.innerHTML = catItemHtml(all) + section.categories.map((cat) => catItemHtml(cat)).join('');
    $('#sidebar-foot').textContent = section.items.length.toLocaleString('pt-BR') + ' itens · Atualizado às ' + (state.profile && state.profile.updatedAt ? fmtTime(state.profile.updatedAt) : '—');
  }
  list.querySelectorAll('.cat-item').forEach((el) => {
    el.addEventListener('click', () => {
      state.content.category = el.dataset.cat === '__all' ? null : el.dataset.cat;
      state.renderLimit = 300;
      renderContent();
    });
  });

  renderGrid();
}

function catItemHtml(cat) {
  const active = state.content.category === cat.id || (cat.id === null && !state.content.category);
  return (
    `<div class="cat-item ${active ? 'active' : ''}" data-cat="${cat.id === null ? '__all' : esc(cat.id)}">` +
      `<span class="cat-name">${esc(cat.name)}</span><span class="cat-count">${cat.count}</span></div>`
  );
}

function renderGrid() {
  const c = state.content;
  const grid = $('#content-grid');
  grid.className = 'grid' + (c.type === 'live' ? ' grid-live' : '');
  const items = filteredItems();
  $('#content-sub').textContent = items.length.toLocaleString('pt-BR') + ' itens encontrados';

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">${ICON.film}<div>Nenhum item encontrado</div></div>`;
    return;
  }

  const slice = items.slice(0, state.renderLimit);
  let html = '';

  if (c.type === 'favorites') {
    html = slice.map((f) => posterCardForFav(f)).join('');
  } else if (c.type === 'live') {
    const catNameMap = {};
    for (const cat of state.data.live.categories) catNameMap[cat.id] = cat.name;
    html = slice.map((it) => liveCardHtml(it, catNameMap[it.category])).join('');
  } else {
    html = slice.map((it) => posterCardHtml(it)).join('');
  }

  if (items.length > state.renderLimit) {
    html += `<div class="load-more-wrap"><button class="btn" id="btn-load-more">Mostrar mais (${(items.length - state.renderLimit).toLocaleString('pt-BR')} restantes)</button></div>`;
  }

  grid.innerHTML = html;
  bindCardEvents(grid);
  const more = $('#btn-load-more');
  if (more) more.onclick = () => { state.renderLimit += 300; renderGrid(); };
}

function renderProfiles() {
  const grid = $('#profiles-grid');
  let html = '';
  for (const p of state.profiles) {
    const isCurrent = state.profile && state.profile.id === p.id;
    html +=
      '<div class="profile-card ' + (isCurrent ? 'current' : '') + '">' +
        '<div class="pc-head">' +
          `<div class="pc-icon ${p.type}">${p.type === 'xtream' ? ICON.server : ICON.film}</div>` +
          '<div style="min-width:0"><div class="pc-name">' + esc(p.name) + '</div>' +
          '<div class="pc-type">' + (p.type === 'xtream' ? 'Xtream Codes · ' + esc(p.server) : 'Playlist M3U · ' + (p.source === 'file' ? 'Arquivo local' : 'URL')) + '</div></div>' +
        '</div>' +
        '<div class="pc-info">' +
          (p.type === 'xtream' ? 'Usuário: <b>' + esc(p.username) + '</b><br>' : '') +
          (p.updatedAt ? 'Última atualização: <b>' + fmtDate(p.updatedAt) + ' às ' + fmtTime(p.updatedAt) + '</b>' : 'Nunca atualizado') +
        '</div>' +
        '<div class="pc-actions">' +
          '<button class="btn primary small" data-popen="' + p.id + '">Abrir</button>' +
          '<button class="btn small" data-prefresh="' + p.id + '">Atualizar</button>' +
          '<button class="btn small" data-pedit="' + p.id + '">Editar</button>' +
          '<button class="btn small danger" data-pdel="' + p.id + '">Excluir</button>' +
        '</div>' +
      '</div>';
  }
  html += '<div class="profile-card add-card" id="add-profile-card">' + ICON.plus + '<span>Adicionar novo perfil</span></div>';
  grid.innerHTML = html;

  grid.querySelectorAll('[data-popen]').forEach((b) => (b.onclick = async () => { await selectProfile(b.dataset.popen); goHome(); }));
  grid.querySelectorAll('[data-prefresh]').forEach((b) => (b.onclick = async () => { await refreshProfileById(b.dataset.prefresh); }));
  grid.querySelectorAll('[data-pedit]').forEach((b) => (b.onclick = () => openProfileForm(state.profiles.find((p) => p.id === b.dataset.pedit))));
  grid.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = () => deleteProfile(b.dataset.pdel)));
  $('#add-profile-card').onclick = () => openProfileForm(null);
}

async function deleteProfile(id) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog('Excluir perfil', `Tem certeza que deseja excluir "${p.name}"? Os favoritos deste perfil também serão removidos.`);
  if (!ok) return;
  state.profiles = state.profiles.filter((x) => x.id !== id);
  state.favorites = state.favorites.filter((f) => f.profileId !== id);
  await saveProfiles();
  await saveFavorites();
  await backend.storeSet('cache_' + id, null);
  if (state.profile && state.profile.id === id) {
    state.profile = null;
    state.data = null;
  }
  renderProfileSelect();
  renderProfiles();
  toast('Perfil excluído.', 'info');
}

async function selectProfile(id) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  state.profile = p;
  state.settings.lastProfileId = id;
  saveSettings();
  renderProfileSelect();

  const cached = await backend.storeGet('cache_' + p.id);
  if (cached && cached.data) {
    state.data = cached.data;
    renderCurrent();
  } else {
    await refreshActiveProfile();
  }
}

async function refreshProfileById(id) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  state.profile = p;
  state.settings.lastProfileId = id;
  saveSettings();
  renderProfileSelect();
  await refreshActiveProfile();
}

async function refreshActiveProfile() {
  const p = state.profile;
  if (!p) return;
  const btn = $('#btn-refresh');
  btn.classList.add('spinning');
  showLoading('Atualizando playlist de ' + p.name + '...');
  try {
    const data = p.type === 'xtream' ? await loadXtreamData(p) : await loadM3UProfile(p);
    state.data = data;
    p.updatedAt = Date.now();
    await saveProfiles();
    await backend.storeSet('cache_' + p.id, { savedAt: Date.now(), data });
    toast('Playlist atualizada com sucesso!', 'success');
    renderCurrent();
  } catch (e) {
    toast('Erro ao atualizar: ' + e.message, 'error');
    if (!state.data) goProfiles();
  } finally {
    btn.classList.remove('spinning');
    hideLoading();
  }
}

function renderCurrent() {
  if (state.view === 'home') renderHome();
  else if (state.view === 'content') {
    if (state.content) renderContent();
  } else if (state.view === 'profiles') renderProfiles();
}

function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch {}
    hlsInstance = null;
  }
}

function showPlayerError(msg) {
  $('#player-loading').classList.add('hidden');
  $('#player-error-msg').textContent = msg;
  $('#player-error').classList.remove('hidden');
}

function playUrl(url, title, sub, onEnded, opts = {}) {
  state.lastPlay = { url, title, sub, onEnded: onEnded || null, opts };
  state.currentTrack = opts.track ? Object.assign({}, opts.track, { position: 0, duration: 0 }) : null;
  state.resumeAt = Number(opts.resume) > 0 ? Number(opts.resume) : 0;
  state.playerOpen = true;
  $('#player').classList.remove('hidden');
  $('#player-title').textContent = title || '';
  $('#player-sub').textContent = sub || '';
  $('#player-error').classList.add('hidden');
  $('#player-loading').classList.remove('hidden');

  const video = $('#player-video');
  destroyHls();
  video.removeAttribute('src');
  video.load();

  const looksHls = /\.m3u8(\?|$)/i.test(url) || /\/live\//i.test(url);

  video.onplaying = () => $('#player-loading').classList.add('hidden');
  video.onwaiting = () => { if (!video.paused) $('#player-loading').classList.remove('hidden'); };
  video.oncanplay = () => $('#player-loading').classList.add('hidden');
  video.onloadedmetadata = () => {
    if (state.resumeAt > 0 && isFinite(video.duration) && state.resumeAt < video.duration - 3) {
      video.currentTime = state.resumeAt;
      toast('Continuando de ' + tc(state.resumeAt), 'info');
    }
    state.resumeAt = 0;
  };

  if (window.Hls && window.Hls.isSupported() && looksHls) {
    const hls = new Hls({
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 2,
      levelLoadingTimeOut: 15000,
      fragLoadingTimeOut: 20000
    });
    hlsInstance = hls;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data && data.fatal) {
        showPlayerError('Falha ao carregar o stream. O servidor pode estar indisponível ou o formato não é suportado. Tente abrir em um player externo.');
      }
    });
  } else {
    video.src = url;
    video.onerror = () => {
      if (state.playerOpen && video.src) {
        showPlayerError('Não foi possível reproduzir este conteúdo. O formato pode não ser suportado pelo player interno (ex: MKV). Tente abrir em um player externo.');
      }
    };
    video.play().catch(() => {});
  }
}

function closePlayer() {
  state.playerOpen = false;
  persistTrack();
  state.currentTrack = null;
  destroyHls();
  const video = $('#player-video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  $('#player').classList.add('hidden');
  $('#player-error').classList.add('hidden');
  $('#player-loading').classList.add('hidden');
}

async function openSeriesDetail(item, profileId) {
  const profile = profileId ? state.profiles.find((p) => p.id === profileId) : state.profile;

  if (item.url) {
    const track = !profileId || (state.profile && state.profile.id === profileId) ? trackForItem(item) : null;
    playUrl(item.url, item.name, 'Série', null, { track });
    return;
  }
  if (!profile || profile.type !== 'xtream') {
    toast('O perfil desta série não está mais disponível.', 'error');
    return;
  }

  openModal(
    '<div class="modal-card wide"><div class="modal-head"><h3>Carregando série...</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
    '<div class="modal-body" style="display:flex;justify-content:center;padding:60px"><div class="spinner big"></div></div></div>'
  );

  let info;
  try {
    info = await fetchJson(xtreamBase(profile) + '&action=get_series_info&series_id=' + encodeURIComponent(item.id), 30000);
  } catch (e) {
    openModal(
      '<div class="modal-card confirm"><div class="modal-head"><h3>Erro</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
      '<div class="modal-body" style="color:var(--muted)">' + esc(e.message) + '</div></div>'
    );
    return;
  }
  if (!$('#modal-backdrop') || $('#modal-backdrop').classList.contains('hidden')) return;

  const infoObj = (info && info.info) || {};
  const episodesMap = (info && info.episodes) || {};
  const seasons = Object.keys(episodesMap).sort((a, b) => Number(a) - Number(b));
  const cover = infoObj.cover || item.image;
  const entry = { key: favKey(profile.id, 'series', item.id), profileId: profile.id, kind: 'series', name: item.name, image: item.image, item: Object.assign({}, item) };
  const faved = isFav(entry.key);

  const contPrefix = `${profile.id}:ep:${item.id}:`;
  const seriesProgress = Object.values(state.progress)
    .filter((e) => e.kind === 'series' && e.key.indexOf(contPrefix) === 0 && e.src)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  const hasBanner = !!(seriesProgress && seriesProgress.position > 30);
  const initialSeason = hasBanner && seasons.indexOf(seriesProgress.src.season) >= 0 ? seriesProgress.src.season : seasons[0];

  let bannerHtml = '';
  if (hasBanner) {
    const shortName = seriesProgress.name.indexOf(item.name + ' — ') === 0 ? seriesProgress.name.slice(item.name.length + 3) : seriesProgress.name;
    bannerHtml =
      '<div class="cont-banner" id="cont-banner">' +
        '<div class="cont-banner-play">' + ICON.play + '</div>' +
        '<div class="cont-banner-info"><b>Continuar assistindo</b><span>' + esc(shortName) + ' · parado em ' + tc(seriesProgress.position) + '</span></div>' +
        '<span class="btn primary sm">Assistir</span>' +
      '</div>';
  }

  let seasonsHtml = '';
  if (seasons.length) {
    seasonsHtml =
      '<div class="season-tabs">' +
      seasons.map((s) => `<div class="season-tab ${s === initialSeason ? 'active' : ''}" data-season="${esc(s)}">Temporada ${esc(s)}</div>`).join('') +
      '</div><div class="episode-list" id="episode-list"></div>';
  }

  openModal(
    '<div class="modal-card wide">' +
      '<div class="modal-head"><h3>Detalhes da série</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
      '<div class="detail-wrap">' +
        '<div class="detail-poster">' + imgTag(cover, ICON.tv) + '</div>' +
        '<div class="detail-info">' +
          '<h3>' + esc(infoObj.name || item.name) + '</h3>' +
          '<div class="detail-tags">' +
            (infoObj.releaseDate ? `<span class="tag">${esc(infoObj.releaseDate)}</span>` : '') +
            (infoObj.rating ? `<span class="tag">⭐ ${esc(infoObj.rating)}</span>` : '') +
            `<span class="tag">${seasons.length} temporada${seasons.length === 1 ? '' : 's'}</span>` +
          '</div>' +
          '<div class="detail-plot">' + esc(infoObj.plot || infoObj.description || 'Sem descrição disponível.') + '</div>' +
          '<div class="detail-actions">' +
            `<button class="btn ${faved ? 'danger' : ''}" id="detail-fav">${ICON.heart} ${faved ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</button>` +
          '</div>' +
          bannerHtml +
          seasonsHtml +
        '</div>' +
      '</div>' +
    '</div>'
  );

  $('#detail-fav').onclick = () => {
    toggleFavorite(entry);
    const nowFaved = isFav(entry.key);
    const b = $('#detail-fav');
    if (b) {
      b.className = 'btn ' + (nowFaved ? 'danger' : '');
      b.innerHTML = ICON.heart + (nowFaved ? ' Remover dos favoritos' : ' Adicionar aos favoritos');
    }
  };

  function findNextEpisode(seasonKey, epId) {
    const eps = episodesMap[seasonKey] || [];
    const idx = eps.findIndex((e) => String(e.id) === String(epId));
    if (idx >= 0 && idx < eps.length - 1) return { season: seasonKey, ep: eps[idx + 1] };
    const sIdx = seasons.indexOf(seasonKey);
    if (sIdx >= 0 && sIdx < seasons.length - 1) {
      const ns = seasons[sIdx + 1];
      const nEps = episodesMap[ns] || [];
      if (nEps.length) return { season: ns, ep: nEps[0] };
    }
    return null;
  }

  function playEp(seasonKey, ep) {
    const s = normalizeServer(profile.server);
    const auth = encodeURIComponent(profile.username) + '/' + encodeURIComponent(profile.password);
    const url = `${s}/series/${auth}/${ep.id}.${ep.container_extension || 'mp4'}`;
    const num = ep.episode_num != null ? ep.episode_num : '';
    const epTitle = ep.title || ('Episódio ' + num);
    const fullTitle = `${item.name} — T${seasonKey}E${num}`;
    const key = `${profile.id}:ep:${item.id}:S${seasonKey}:${ep.id}`;
    const track = {
      key,
      kind: 'series',
      profileId: profile.id,
      name: fullTitle,
      image: item.image,
      src: { type: 'episode', seriesId: item.id, season: seasonKey, epId: ep.id, ext: ep.container_extension || 'mp4' }
    };
    const start = () => playUrl(url, fullTitle, epTitle, () => {
      const next = findNextEpisode(seasonKey, ep.id);
      if (next) {
        const nNum = next.ep.episode_num != null ? next.ep.episode_num : '';
        toast(`Próximo episódio: T${next.season} E${nNum}`, 'info');
        playEp(next.season, next.ep);
      }
    }, { track });
    const saved = state.progress[key];
    if (saved && saved.position > 30) {
      promptResume(saved, start);
      return;
    }
    start();
  }

  function renderEpisodes(season) {
    const list = $('#episode-list');
    if (!list) return;
    const eps = episodesMap[season] || [];
    if (!eps.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px"><div>Nenhum episódio disponível.</div></div>';
      return;
    }
    list.innerHTML = eps.map((ep) => {
      const thumb = (ep.info && ep.info.movie_image) || '';
      const num = ep.episode_num != null ? ep.episode_num : '';
      const name = ep.title || ('Episódio ' + num);
      const prog = state.progress[`${profile.id}:ep:${item.id}:S${season}:${ep.id}`];
      const watched = !!(prog && prog.position > 30);
      return (
        `<div class="episode${watched ? ' ep-watched' : ''}" data-ep="${esc(JSON.stringify({ id: ep.id, ext: ep.container_extension || 'mp4', num, name }))}">` +
          '<div class="ep-thumb">' + imgTag(thumb, ICON.play) + '</div>' +
          `<span class="ep-num">E${esc(num)}</span>` +
          `<span class="ep-name">${esc(name)}</span>` +
          (watched ? `<span class="ep-resume">Parado em ${tc(prog.position)}</span>` : '') +
        '</div>'
      );
    }).join('');
    list.querySelectorAll('.episode').forEach((el) => {
      el.onclick = () => {
        const d = JSON.parse(el.dataset.ep);
        const orig = (episodesMap[season] || []).find((e) => String(e.id) === String(d.id)) || { id: d.id, container_extension: d.ext, episode_num: d.num, title: d.name };
        playEp(season, orig);
      };
    });
  }

  if (seasons.length) {
    $$('#modal .season-tab').forEach((tab) => {
      tab.onclick = () => {
        $$('#modal .season-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderEpisodes(tab.dataset.season);
      };
    });
    renderEpisodes(initialSeason);
  }

  if (hasBanner) {
    const banner = $('#cont-banner');
    if (banner) {
      banner.onclick = () => {
        const src = seriesProgress.src;
        const s = normalizeServer(profile.server);
        const auth = encodeURIComponent(profile.username) + '/' + encodeURIComponent(profile.password);
        const url = `${s}/series/${auth}/${src.epId}.${src.ext || 'mp4'}`;
        const track = { key: seriesProgress.key, kind: 'series', profileId: profile.id, name: seriesProgress.name, image: seriesProgress.image, src };
        playUrl(url, seriesProgress.name, 'Episódio', () => {
          const next = findNextEpisode(src.season, src.epId);
          if (next) {
            const nNum = next.ep.episode_num != null ? next.ep.episode_num : '';
            toast(`Próximo episódio: T${next.season} E${nNum}`, 'info');
            playEp(next.season, next.ep);
          }
        }, { track, resume: seriesProgress.position });
      };
    }
  }
}

function openProfileForm(profile) {
  const isEdit = !!profile;
  const initialTab = profile && profile.type === 'm3u' ? 'm3u' : 'xtream';

  openModal(
    '<div class="modal-card">' +
      '<div class="modal-head"><h3>' + (isEdit ? 'Editar perfil' : 'Adicionar perfil') + '</h3><button class="icon-btn" data-close>' + ICON.x + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="tabs">' +
          `<div class="tab ${initialTab === 'xtream' ? 'active' : ''}" data-tab-pf="xtream">Xtream Codes</div>` +
          `<div class="tab ${initialTab === 'm3u' ? 'active' : ''}" data-tab-pf="m3u">Playlist M3U</div>` +
        '</div>' +

        '<div id="pf-pane-xtream">' +
          '<div class="form-group"><label>Nome do perfil</label><input id="pf-x-name" placeholder="Ex: Minha IPTV" value="' + esc(isEdit && profile.type === 'xtream' ? profile.name : '') + '"></div>' +
          '<div class="form-group"><label>Servidor (URL)</label><input id="pf-x-server" placeholder="http://servidor.com:8080" value="' + esc(isEdit && profile.type === 'xtream' ? profile.server : '') + '"></div>' +
          '<div class="form-group"><label>Usuário</label><input id="pf-x-user" placeholder="usuario" value="' + esc(isEdit && profile.type === 'xtream' ? profile.username : '') + '"></div>' +
          '<div class="form-group"><label>Senha</label><input id="pf-x-pass" placeholder="senha" value="' + esc(isEdit && profile.type === 'xtream' ? profile.password : '') + '"></div>' +
          '<button class="btn small" id="pf-x-test">Testar conexão</button>' +
          '<div class="test-result" id="pf-x-test-result"></div>' +
        '</div>' +

        '<div id="pf-pane-m3u" class="hidden">' +
          '<div class="form-group"><label>Nome do perfil</label><input id="pf-m-name" placeholder="Ex: Playlist M3U" value="' + esc(isEdit && profile.type === 'm3u' ? profile.name : '') + '"></div>' +
          '<div class="form-group"><label>URL da playlist (opcional)</label><input id="pf-m-url" placeholder="http://servidor.com/playlist.m3u" value="' + esc(isEdit && profile.type === 'm3u' && profile.source === 'url' ? profile.url : '') + '"></div>' +
          '<div class="form-group"><label>Ou selecione um arquivo .m3u</label>' +
            '<div class="file-row"><input id="pf-m-file" readonly placeholder="Nenhum arquivo selecionado" value="' + esc(isEdit && profile.type === 'm3u' && profile.source === 'file' ? profile.path : '') + '">' +
            '<button class="btn small" id="pf-m-browse">Procurar</button></div>' +
            '<div class="form-hint">Você pode usar uma URL, um arquivo local, ou ambos (a URL terá prioridade na atualização).</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn ghost" data-close>Cancelar</button>' +
        '<button class="btn primary" id="pf-save">Salvar e carregar</button>' +
      '</div>' +
    '</div>'
  );

  let activeTab = initialTab;
  let pickedFile = isEdit && profile.type === 'm3u' && profile.source === 'file' ? { path: profile.path } : null;

  function switchTab(tab) {
    activeTab = tab;
    $$('#modal .tab').forEach((t) => t.classList.toggle('active', t.dataset.tabPf === tab));
    $('#pf-pane-xtream').classList.toggle('hidden', tab !== 'xtream');
    $('#pf-pane-m3u').classList.toggle('hidden', tab !== 'm3u');
  }
  $$('#modal [data-tab-pf]').forEach((t) => (t.onclick = () => switchTab(t.dataset.tabPf)));

  $('#pf-m-browse').onclick = async () => {
    const r = await backend.openM3uFile();
    if (r && r.path) {
      pickedFile = { path: r.path };
      $('#pf-m-file').value = r.path;
      $('#pf-m-url').value = '';
      toast('Arquivo carregado: ' + r.path.split(/[\\/]/).pop(), 'success');
    }
  };

  $('#pf-x-test').onclick = async () => {
    const res = $('#pf-x-test-result');
    const server = $('#pf-x-server').value.trim();
    const user = $('#pf-x-user').value.trim();
    const pass = $('#pf-x-pass').value.trim();
    if (!server || !user || !pass) {
      res.className = 'test-result err';
      res.textContent = 'Preencha servidor, usuário e senha.';
      return;
    }
    res.className = 'test-result';
    res.style.display = 'block';
    res.textContent = 'Testando conexão...';
    try {
      const base = normalizeServer(server) + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);
      const info = await fetchJson(base, 15000);
      if (info && info.user_info && (info.user_info.auth === 1 || info.user_info.auth === '1' || info.user_info.auth === true)) {
        res.className = 'test-result ok';
        res.textContent = 'Conexão OK! Usuário: ' + info.user_info.username;
      } else {
        res.className = 'test-result err';
        res.textContent = 'Autenticação recusada pelo servidor.';
      }
    } catch (e) {
      res.className = 'test-result err';
      res.textContent = 'Falha na conexão: ' + e.message;
    }
  };

  $('#pf-save').onclick = async () => {
    if (activeTab === 'xtream') {
      const name = $('#pf-x-name').value.trim();
      const server = $('#pf-x-server').value.trim();
      const username = $('#pf-x-user').value.trim();
      const password = $('#pf-x-pass').value.trim();
      if (!name || !server || !username || !password) {
        toast('Preencha todos os campos do Xtream Codes.', 'error');
        return;
      }
      const prof = isEdit ? profile : { id: uid() };
      Object.assign(prof, { type: 'xtream', name, server: normalizeServer(server), username, password, updatedAt: prof.updatedAt || null });
      await upsertAndLoad(prof, isEdit);
    } else {
      const name = $('#pf-m-name').value.trim();
      const url = $('#pf-m-url').value.trim();
      if (!name) {
        toast('Informe um nome para o perfil.', 'error');
        return;
      }
      if (!url && !pickedFile) {
        toast('Informe uma URL ou selecione um arquivo M3U.', 'error');
        return;
      }
      const prof = isEdit ? profile : { id: uid() };
      Object.assign(prof, {
        type: 'm3u',
        name,
        source: url ? 'url' : 'file',
        url: url || '',
        path: pickedFile ? pickedFile.path : '',
        updatedAt: prof.updatedAt || null
      });
      await upsertAndLoad(prof, isEdit);
    }
  };

  async function upsertAndLoad(prof, isEdit) {
    if (!isEdit) state.profiles.push(prof);
    await saveProfiles();
    closeModal();
    renderProfileSelect();
    await refreshProfileById(prof.id);
    if (state.data) goHome();
  }
}

function bindEvents() {
  $('#btn-brand').onclick = goHome;
  $('#btn-profiles').onclick = goProfiles;

  $('#btn-refresh').onclick = () => {
    if (!state.profile) {
      toast('Nenhum perfil ativo.', 'error');
      return;
    }
    refreshActiveProfile();
  };

  $('#profile-select').onchange = (e) => {
    if (e.target.value) {
      selectProfile(e.target.value).then(goHome);
    }
  };

  $$('.tile').forEach((tile) => {
    tile.onclick = () => openContent(tile.dataset.type);
  });

  $('#btn-content-back').onclick = goHome;

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (!state.content) return;
      state.content.query = e.target.value.trim();
      state.renderLimit = 300;
      renderGrid();
    }, 180);
  });

  $('#btn-player-back').onclick = closePlayer;
  $('#btn-player-close').onclick = closePlayer;
  $('#btn-player-retry').onclick = () => state.lastPlay && playUrl(state.lastPlay.url, state.lastPlay.title, state.lastPlay.sub, state.lastPlay.onEnded, state.lastPlay.opts);

  const videoEl = $('#player-video');
  videoEl.addEventListener('timeupdate', () => {
    if (!state.currentTrack || !isFinite(videoEl.duration) || videoEl.currentTime < 15) return;
    state.currentTrack.position = videoEl.currentTime;
    state.currentTrack.duration = videoEl.duration;
    const now = Date.now();
    if (now - state.lastTrackSave > 5000) {
      state.lastTrackSave = now;
      persistTrack();
    }
  });

  videoEl.addEventListener('ended', () => {
    if (state.currentTrack) removeProgress(state.currentTrack.key, true);
    if (state.lastPlay && typeof state.lastPlay.onEnded === 'function') {
      state.lastPlay.onEnded();
    }
  });
  $('#btn-player-external').onclick = () => {
    const video = $('#player-video');
    const url = state.lastPlay ? state.lastPlay.url : video.src;
    if (url) backend.openExternal(url);
  };
  $('#btn-player-ext2').onclick = () => {
    if (state.lastPlay) backend.openExternal(state.lastPlay.url);
  };

  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target === $('#modal-backdrop')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modal-backdrop').classList.contains('hidden')) closeModal();
      else if (!$('#player').classList.contains('hidden')) closePlayer();
    }
  });
}

async function init() {
  bindEvents();
  await loadStores();
  renderProfileSelect();
  const lastId = state.settings.lastProfileId;
  const p = state.profiles.find((x) => x.id === lastId) || state.profiles[0];
  if (p) {
    await selectProfile(p.id);
    goHome();
  } else {
    goProfiles();
  }
}

init();
