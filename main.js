const electronModule = require('electron');
if (typeof electronModule !== 'object' || !electronModule.app) {
  console.error('[boot] require("electron") retornou:', typeof electronModule, electronModule);
  console.error('[boot] process.type:', process.type, '| versions:', JSON.stringify(process.versions));
  process.exit(2);
}
const { app, BrowserWindow, ipcMain, dialog, shell } = electronModule;
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke');

function dataDir() {
  const d = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function readJSON(name, fallback) {
  try {
    const raw = fs.readFileSync(path.join(dataDir(), name + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(name, value) {
  try {
    fs.writeFileSync(path.join(dataDir(), name + '.json'), JSON.stringify(value, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0e14',
    show: false,
    autoHideMenuBar: true,
    title: 'Nova IPTV',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (SMOKE) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        console.log('SMOKE_OK');
        app.exit(0);
      }, 3000);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('SMOKE_FAIL', details && details.reason);
      app.exit(1);
    });
    win.webContents.on('console-message', (_e, level, message) => {
      console.log('[renderer]', level, message);
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('store:get', (_e, name) => readJSON(String(name), null));

ipcMain.handle('store:set', (_e, name, value) => writeJSON(String(name), value));

ipcMain.handle('http:get', async (_e, opts) => {
  const url = opts && typeof opts.url === 'string' ? opts.url : '';
  if (!/^https?:/i.test(url)) return { ok: false, status: 0, error: 'URL inválida' };
  const timeout = Math.min(Number(opts.timeout) || 30000, 120000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NovaIPTV/1.0', 'Accept': '*/*' }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: opts.json ? safeJson(text) : text };
  } catch (err) {
    return { ok: false, status: 0, error: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('file:openM3u', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Selecionar playlist M3U',
    filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8', 'txt'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  try {
    return { path: p, content: fs.readFileSync(p, 'utf8') };
  } catch {
    return { path: p, content: null };
  }
});

ipcMain.handle('file:readText', (_e, p) => {
  try {
    return fs.readFileSync(String(p), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('shell:open', (_e, url) => {
  if (/^https?:/i.test(String(url))) return shell.openExternal(String(url));
  return false;
});

ipcMain.handle('app:version', () => app.getVersion());
