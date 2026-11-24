const { app, BrowserWindow, Tray, Menu, screen, ipcMain, session, desktopCapturer, nativeImage, net, Notification, powerMonitor, powerSaveBlocker, globalShortcut, shell } = require('electron');
const { createUpdater } = require('./updater');
const HOTKEY = 'CommandOrControl+Alt+L';
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.setAppUserModelId('app.auralyrics');

// ---------- logging (%APPDATA%\Auralyrics\auralyrics.log; the packaged app has no console) ----------
const logFile = () => path.join(app.getPath('userData'), 'auralyrics.log');
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map(x => x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}\n`;
  try { fs.appendFileSync(logFile(), line); } catch {}
  if (process.env.AURALYRICS_DEBUG) process.stdout.write(line);
}
process.on('uncaughtException', e => log('uncaught', e));
process.on('unhandledRejection', e => log('unhandled', e));

// ---------- settings ----------
const STYLE_NAMES = {
  ship: 'Ship', fisheye: 'Fisheye', visual: 'Visual', fisheyeVisual: 'Fisheye Visual', codestyle: 'Codestyle', codestyleVisual: 'Codestyle Visual',
  branches: 'Branches', web: 'Web', constellation: 'Constellation', messages: 'Native Design', money: 'Native Design Money', map: 'Native Design Map',
  notifications: 'Native Design Notifications', stack: 'Stack', karaoke: 'Karaoke', minimal: 'Minimal', poster: 'Poster'
};
const { pickStyle } = require('./autostyle');
const GLOW_STYLES = [['twin', 'Twin orbit'], ['orbit', 'Orbit'], ['rim', 'Rim'], ['corners', 'Corners'], ['bars', 'Top & bottom']];
const DEFAULTS = {
  v: 4,
  // glow
  enabled: true, glowMode: 'music', glowStyle: 'twin', glowColors: 2, color1: '#ff3d81', color2: '#4d7cff', albumColors: true,
  thickness: 10, glow: 60, intensity: 1.0, speed: 1.0, idleBrightness: 0.8, glowDisplays: 'all', glowOverFullscreen: true,
  glowDesktop: false,   // the screen-edge glow outside full screen; off by default (full-screen lyrics draw their own)
  // lyrics
  lyrics: true, lyricStyle: 'visual', lyricShuffle: 'auto',   // auto (fits each song, and switches during it) | off | song (new style every song) | minute (and every minute)
  pinnedStyles: ['visual', 'messages', 'codestyle', 'stack', 'poster'],
  lyricFont: 'Segoe UI Variable Display', lyricScale: 100, lyricMatchAlbum: true,
  lyricColors: { text: '#f2f2f2', hl: '#ff7a7a', sec: '#ffffff' },
  lyricOffset: 0, lyricLock: true, lyricBackdrop: false, lyricBounds: null,
  // full-screen lyrics (the main lyrics view)
  keepAwake: true, stageDisplays: [], stageBg: 'art', stageClock: true, openFullOnLaunch: false, stageLyrics: true, stageBounds: null,
  glowSplit: 60,
  // general
  startup: false, onboarded: false, autoUpdateCheck: true
};
let settings = JSON.parse(JSON.stringify(DEFAULTS));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
// 2.0: the app used to be called Glowrim. Carry its settings over once, the first time Auralyrics starts.
function migrateLegacy() {
  try {
    const old = path.join(app.getPath('appData'), 'glowrim', 'settings.json');
    if (!fs.existsSync(settingsFile()) && fs.existsSync(old)) { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.copyFileSync(old, settingsFile()); }
  } catch {}
}
function load() {
  migrateLegacy();
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (!s.v || s.v < 2) { delete s.thickness; delete s.glow; delete s.idleBrightness; }
    if (!s.v || s.v < 3) {
      if (s.mode) s.glowMode = s.mode === 'idle' ? 'idle' : 'music';
      if (s.lyricSize) s.lyricScale = Math.round(s.lyricSize / 34 * 100);
      if (s.lyricStyle === 'bubbles') s.lyricStyle = 'messages';
      delete s.mode; delete s.lyricSize;
    }
    // 1.6: Auto lyric style and Twin orbit became the defaults; move people still on the old defaults (Off / Rim) across
    if (!s.v || s.v < 4) { if (!s.lyricShuffle || s.lyricShuffle === 'off') s.lyricShuffle = 'auto'; if (!s.glowStyle || s.glowStyle === 'rim') s.glowStyle = 'twin'; }
    settings = { ...settings, ...s, v: DEFAULTS.v };
    if (!STYLE_NAMES[settings.lyricStyle]) settings.lyricStyle = DEFAULTS.lyricStyle;
    if (!['auto', 'off', 'song', 'minute'].includes(settings.lyricShuffle)) settings.lyricShuffle = DEFAULTS.lyricShuffle;
    if (!GLOW_STYLES.some(g => g[0] === settings.glowStyle)) settings.glowStyle = DEFAULTS.glowStyle;
  } catch {}
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {} }, 250); }

// ---------- state ----------
let overlays = [], lyricsWin = null, tray = null, audioWin = null, mediaProc = null, stageWins = [];
let stageWin = null, returnHome = false;   // stageWin: the movable lyrics window. stageWins: the full-screen copies of it (one per display)
let nowPlaying = { title: '', artist: '', status: 'None', app: '', art: '' };
let timeline = { pos: 0, dur: 0, upd: 0, status: 'None', canSeek: false };
let lyrics = { key: '', state: 'none', lines: [], plain: '', timing: null };
let artColors = null, songNudge = 0, quitting = false, resting = false, fsDisplayId = null;
let shuffleStyle = null, shuffleTimer = null, updater = null;
let stageAuto = false, awakeId = null, lastHelperMsg = 0, helperStarted = 0;
const preload = path.join(__dirname, 'preload.js');
const unpacked = f => path.join(__dirname, f).replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const alive = w => w && !w.isDestroyed();
const playing = () => nowPlaying.status === 'Playing';

function state() {
  const useArt = settings.albumColors && artColors;
  const c1 = useArt ? artColors[0] : settings.color1;
  const c2 = settings.glowColors === 1 ? c1 : (useArt ? artColors[1] : settings.color2);
  // lyric colours follow the album cover independently of the glow's colour count
  const activeStyle = settings.lyricShuffle !== 'off' && shuffleStyle ? shuffleStyle : settings.lyricStyle;
  return { ...settings, c1, c2, lc1: useArt ? artColors[0] : settings.color1, lc2: useArt ? artColors[1] : settings.color2, songNudge, playing: playing(), activeStyle, update: updater ? updater.snapshot() : null };
}
// ---------- style shuffle ----------
// Picks from the pinned styles when two or more are pinned (your favourites), otherwise from every style.
// Never repeats the style that is already showing.
// Auto does the same, but weighs the pool by how well each style fits the song (see autostyle.js). It waits for the new
// song's lyrics before choosing, so the style on screen changes once, not twice.
function shuffleNext(lyricsReady) {
  const mode = settings.lyricShuffle;
  if (mode === 'off') return false;
  if (mode === 'auto' && shuffleStyle && !lyricsReady) return false;
  const pinned = (settings.pinnedStyles || []).filter(k => STYLE_NAMES[k]);
  const pool = pinned.length >= 2 ? pinned : Object.keys(STYLE_NAMES);
  const cur = shuffleStyle || settings.lyricStyle, opts = pool.filter(k => k !== cur);
  let next;
  if (mode === 'auto') {
    const r = pickStyle({ lines: lyrics.state === 'synced' ? lyrics.lines : [], durMs: timeline.dur, pool, current: cur });
    next = r.style; log('auto style', next, '←', r.reason);
  } else next = opts[Math.floor(Math.random() * opts.length)] || cur;
  const changed = next !== shuffleStyle; shuffleStyle = next; return changed;
}
// Auto also mixes it up inside a song: a new style every 40 to 75 seconds, picked the same weighted way. The timer starts over
// whenever a song picks its style, so a change never lands right after the song's own pick.
// A style picked by hand holds until the next song (autoHeld), the way "choosing one by hand holds it" always worked.
const AUTO_SWITCH_MS = [40000, 75000];
let autoHeld = false;
function armAutoTimer() {
  clearInterval(shuffleTimer); shuffleTimer = null;
  if (settings.lyricShuffle !== 'auto') return;
  shuffleTimer = setTimeout(() => {
    if (!autoHeld && playing() && !resting && lyrics.state === 'synced' && shuffleNext(true)) { broadcast(); refreshMenu(); }
    armAutoTimer();
  }, AUTO_SWITCH_MS[0] + Math.random() * (AUTO_SWITCH_MS[1] - AUTO_SWITCH_MS[0]));
}
function syncShuffle() {
  clearInterval(shuffleTimer); shuffleTimer = null;
  if (settings.lyricShuffle === 'off') { shuffleStyle = null; return; }
  if (!shuffleStyle) shuffleNext();
  if (settings.lyricShuffle === 'auto') armAutoTimer();
  if (settings.lyricShuffle === 'minute') shuffleTimer = setInterval(() => { if (playing() && shuffleNext()) { broadcast(); refreshMenu(); } }, 60000);
}
function send(win, ch, data) { if (alive(win)) win.webContents.send(ch, data); }
const uiWindows = () => [lyricsWin, stageWin, ...stageWins];
function broadcastNow() {
  const s = state();
  overlays.forEach(w => send(w, 'settings', s));
  uiWindows().forEach(w => send(w, 'settings', s));
}
// Slider drags fire 100+ patches a second. Send the first one at once (no added latency),
// then at most one every 12 ms, always ending on the latest value.
let bcT = null, bcPending = false;
function broadcast() {
  if (bcT) { bcPending = true; return; }
  broadcastNow();
  bcT = setTimeout(function tail() { bcT = null; if (bcPending) { bcPending = false; broadcast(); } }, 12);
}
const nowPayload = () => ({ ...nowPlaying, colors: artColors });
function sendNow() { const n = nowPayload(); uiWindows().forEach(w => send(w, 'now', n)); }
function sendTime() { uiWindows().forEach(w => send(w, 'time', timeline)); }
function sendLyrics() { uiWindows().forEach(w => send(w, 'lyrics', lyrics)); }
function primeWindow(w) { send(w, 'settings', state()); send(w, 'now', nowPayload()); send(w, 'time', timeline); send(w, 'lyrics', lyrics); }

// ---------- displays ----------
function displayList() {
  const pid = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: d.label || `Display ${i + 1}`, primary: d.id === pid, size: `${d.size.width}×${d.size.height}`, scale: d.scaleFactor }));
}
function glowAllowed(d) {
  const g = settings.glowDisplays;
  if (g === 'all') return true;
  if (g === 'main') return d.id === screen.getPrimaryDisplay().id;
  return String(d.id) === String(g) || !screen.getAllDisplays().some(x => String(x.id) === String(g)); // chosen monitor gone → fall back to all
}

// ---------- glow overlays ----------
function buildOverlays() {
  overlays.forEach(w => alive(w) && w.destroy());
  overlays = screen.getAllDisplays().filter(glowAllowed).map(d => {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      transparent: true, frame: false, resizable: false, movable: false, hasShadow: false,
      skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
      webPreferences: { preload, backgroundThrottling: false }
    });
    w._displayId = d.id;
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setIgnoreMouseEvents(true);
    w.loadFile('overlay.html');
    w.webContents.once('did-finish-load', () => { w.setBounds(d.bounds); send(w, 'settings', state()); updateOverlays(); });
    return w;
  });
  if (alive(lyricsWin)) lyricsWin.moveTop();
  [stageWin, ...stageWins].forEach(w => send(w, 'displays', displayList()));
}
function updateOverlays() {
  overlays.forEach(w => {
    if (!alive(w)) return;
    const hideFs = !settings.glowOverFullscreen && fsDisplayId != null && w._displayId === fsDisplayId;
    // full-screen lyrics draw their own glow; step aside there so it isn't doubled
    const underStage = stageWins.some(s => alive(s) && s.isVisible() && !s.isMinimized() && s._displayId === w._displayId);
    const show = settings.enabled && settings.glowDesktop && !resting && !hideFs && !underStage;
    if (show && !w.isVisible()) w.showInactive();
    if (!show && w.isVisible()) w.hide();
  });
}

// ---------- floating lyrics window ----------
function defaultLyricBounds() {
  const wa = screen.getPrimaryDisplay().workArea, width = 820, height = 320;
  return { width, height, x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + wa.height - height - 40) };
}
function onSomeDisplay(b) {
  return b && screen.getAllDisplays().some(d => { const a = d.workArea;
    return b.x < a.x + a.width - 60 && b.x + b.width > a.x + 60 && b.y < a.y + a.height - 40 && b.y + b.height > a.y + 40; });
}
function buildLyricsWin() {
  const b = onSomeDisplay(settings.lyricBounds) ? settings.lyricBounds : defaultLyricBounds();
  lyricsWin = new BrowserWindow({
    ...b, minWidth: 320, minHeight: 120, transparent: true, frame: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Auralyrics Lyrics',
    webPreferences: { preload, backgroundThrottling: false }
  });
  lyricsWin.setAlwaysOnTop(true, 'screen-saver');
  applyLock();
  lyricsWin.loadFile('lyrics.html');
  lyricsWin.webContents.once('did-finish-load', () => { primeWindow(lyricsWin); updateLyricsVisibility(); });
  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { if (alive(lyricsWin)) { settings.lyricBounds = lyricsWin.getBounds(); save(); } }, 400); };
  lyricsWin.on('moved', remember); lyricsWin.on('resized', remember);
}
function applyLock() {
  if (!alive(lyricsWin)) return;
  const locked = settings.lyricLock;
  // locked = click-through, but mouse moves are still forwarded so the page can reveal its hover bar (see 'lyricsHit')
  lyricsWin.setIgnoreMouseEvents(locked, locked ? { forward: true } : undefined); lyricsWin.setFocusable(!locked); lyricsWin.setResizable(!locked);
}
function updateLyricsVisibility() {
  if (!alive(lyricsWin)) return;
  const homeOpen = alive(stageWin) && stageWin.isVisible() && !stageWin.isMinimized();   // the lyrics window already shows them
  const show = settings.lyrics && !!nowPlaying.title && !resting && !stageWins.length && !homeOpen;
  if (show && !lyricsWin.isVisible()) { lyricsWin.showInactive(); lyricsWin.moveTop(); }
  if (!show && lyricsWin.isVisible()) lyricsWin.hide();
}

// ---------- The lyrics window: the main window. Move it, resize it, minimise it. Maximise (or F11) goes full screen. ----------
function defaultHomeBounds() {
  const wa = screen.getPrimaryDisplay().workArea, width = Math.min(1100, wa.width - 80), height = Math.min(680, wa.height - 80);
  return { width, height, x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2) };
}
function openHome() {
  if (stageWins.length) { stageWins.forEach(w => alive(w) && (w.show(), w.focus())); return; }   // already full screen
  if (alive(stageWin)) { bringToFront(stageWin); return; }
  const b = onSomeDisplay(settings.stageBounds) ? settings.stageBounds : defaultHomeBounds();
  const w = stageWin = new BrowserWindow({
    ...b, minWidth: 360, minHeight: 240, title: 'Auralyrics', backgroundColor: '#000000', icon: appIcon(64), autoHideMenuBar: true, show: false,
    webPreferences: { preload, backgroundThrottling: false }
  });
  w.loadFile('stage.html', { query: { mode: 'window' } });
  w.webContents.once('did-finish-load', () => { primeWindow(w); send(w, 'displays', displayList()); sendStatus(); if (alive(w)) { w.show(); w.focus(); } });
  ['show', 'hide', 'minimize', 'restore'].forEach(ev => w.on(ev, () => updateLyricsVisibility()));
  // the maximise button means "make it big": go to real full screen, and come back to this window afterwards
  w.on('maximize', () => { w.unmaximize(); openStage(); });
  let t; const remember = () => { clearTimeout(t); t = setTimeout(() => { if (alive(w) && !w.isMinimized() && !w.isFullScreen()) { settings.stageBounds = w.getNormalBounds(); save(); } }, 400); };
  w.on('moved', remember); w.on('resized', remember);
  w.on('closed', () => { if (stageWin === w) stageWin = null; updateLyricsVisibility(); refreshMenu(); });
  updateLyricsVisibility();
}

// ---------- Full-screen lyrics: the same view, one window per display, with Verci-style settings on top ----------
function stageTargets(home) {
  const all = screen.getAllDisplays(), ids = (settings.stageDisplays || []).map(String);
  const chosen = all.filter(d => ids.includes(String(d.id)));
  if (chosen.length) return chosen;
  return [home ? screen.getDisplayMatching(home.getBounds()) : screen.getPrimaryDisplay()];   // the display the window is on
}
function openStage() {
  if (stageWins.length) { stageWins.forEach(w => alive(w) && (w.show(), w.focus())); return; }
  const shot = process.env.AURALYRICS_SHOT; // dev only: render off-screen and save screenshots (AURALYRICS_SHOT_SIZE=1000x620, AURALYRICS_SHOT_MODE=window)
  const shotSize = (process.env.AURALYRICS_SHOT_SIZE || '1600x900').split('x').map(Number), shotWin = process.env.AURALYRICS_SHOT_MODE === 'window';
  const home = alive(stageWin) && stageWin.isVisible() ? stageWin : null;
  returnHome = !!home;                                                    // leaving full screen brings the window back
  stageWins = stageTargets(home).slice(0, shot ? 1 : 9).map((d, k) => {
    const w = new BrowserWindow({
      ...(shot ? { width: shotSize[0], height: shotSize[1] } : d.bounds), frame: false, show: false, title: 'Auralyrics Lyrics', backgroundColor: '#000000',
      icon: appIcon(64), autoHideMenuBar: true, webPreferences: { preload, backgroundThrottling: false, offscreen: !!shot }
    });
    w._displayId = d.id;
    ['show', 'hide', 'minimize', 'restore', 'enter-full-screen'].forEach(ev => w.on(ev, () => setTimeout(updateOverlays, 50)));
    w.loadFile('stage.html', shot && shotWin ? { query: { mode: 'window' } } : undefined);
    w.webContents.once('did-finish-load', () => {
      primeWindow(w); send(w, 'displays', displayList()); sendStatus();
      if (shot) {
        [[6000, 'idle', ''], [8000, 'ui', ''], [10000, 'lyrmenu', "openMenu('mLyr')"], [12000, 'glowmenu', "openMenu('mGlow')"], [14000, 'statusmenu', "openMenu('mStatus')"], [16000, 'appmenu', "openMenu('mApp')"]].forEach(([ms, name, js]) => setTimeout(() =>
          w.webContents.executeJavaScript(`${name === 'idle' ? "document.body.classList.add('idle')" : 'wake()'};${js}`)
            .then(() => new Promise(r => setTimeout(r, 500))).then(() => w.webContents.capturePage())
            .then(img => fs.writeFileSync(path.join(shot, `stage-${name}.png`), img.toPNG())), ms));
        return;
      }
      w.setBounds(d.bounds); w.setFullScreen(true); w.show(); if (k === 0) { w.focus(); if (alive(home)) home.hide(); }
    });
    w.on('closed', () => {
      stageWins = stageWins.filter(x => x !== w); updateOverlays(); updateLyricsVisibility(); refreshMenu(); sendStatus();
      if (!stageWins.length && returnHome && !quitting) { returnHome = false; openHome(); }
    });
    return w;
  });
  log('full-screen lyrics open', { displays: stageWins.length });
  updateLyricsVisibility(); refreshMenu();
}
function closeStage(toHome = true) { if (!toHome) returnHome = false; stageWins.forEach(w => alive(w) && w.close()); stageWins = []; updateLyricsVisibility(); refreshMenu(); }
const toggleStage = () => stageWins.length ? closeStage() : openStage();

// ---------- keep the screen awake while music plays ----------
function updateAwake() {
  const want = settings.keepAwake && playing() && !resting;
  if (want && awakeId == null) awakeId = powerSaveBlocker.start('prevent-display-sleep');
  if (!want && awakeId != null) { powerSaveBlocker.stop(awakeId); awakeId = null; }
}

// ---------- rest while locked / asleep ----------
let homeAfterRest = false;   // full screen closes while locked; bring the lyrics window back afterwards if it was in use
function setResting(v) {
  if (resting === v) return; resting = v; log('resting', v);
  send(audioWin, 'audio', v ? 'pause' : 'resume');
  if (v) { homeAfterRest = homeAfterRest || returnHome; closeStage(false); }
  else if (homeAfterRest) { homeAfterRest = false; if (!stageWins.length) openHome(); }
  updateOverlays(); updateLyricsVisibility(); updateAwake();
}

// ---------- synced lyrics from LRCLIB (free, open lyrics database) ----------
const lyricCache = new Map();
const UA = { 'User-Agent': 'Auralyrics/' + require('./package.json').version + ' (desktop lyrics app)' };
async function lrclib(q) {
  const res = await net.fetch('https://lrclib.net/api/' + q, { headers: UA });
  if (res.status === 404 || res.status === 400) return null; // 400 = query LRCLIB can't use; treat as "not found"
  if (!res.ok) throw new Error('lrclib HTTP ' + res.status);
  return res.json();
}
const ts = (m, s) => Math.round((+m * 60 + +s) * 1000);
function parseLRC(src) {
  const out = [];
  for (const raw of (src || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '');
    // Enhanced LRC word timing: <mm:ss.xx>word
    const wt = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)];
    const words = [];
    wt.forEach(m => m[3].trim().split(/\s+/).filter(Boolean).forEach((w, k, arr) => words.push({ w, t: ts(m[1], m[2]) + k * 120 })));
    const text = wt.length ? words.map(w => w.w).join(' ') : body.trim();
    for (const m of tags) out.push({ t: ts(m[1], m[2]), text, ...(words.length ? { words } : {}) });
  }
  return out.sort((a, b) => a.t - b.t);
}
function pack(r, durSec) {
  let lines = parseLRC(r.syncedLyrics);
  // Sped-up / slowed versions: stretch the original's timestamps to this track's length.
  if (lines.length && durSec && r.duration) {
    const k = durSec / r.duration;
    if (Math.abs(k - 1) > 0.03 && Math.abs(k - 1) < 0.45)
      lines = lines.map(l => ({ ...l, t: Math.round(l.t * k), ...(l.words ? { words: l.words.map(w => ({ ...w, t: Math.round(w.t * k) })) } : {}) }));
  }
  return { lines, plain: r.plainLyrics || '', instrumental: !!r.instrumental, source: `${r.artistName} — ${r.trackName}` };
}
async function findLyrics(title, artist, durSec) {
  const mainArtist = artist.split(/\s*(?:,|&|\bfeat\.?\s|\bft\.?\s|\sx\s)\s*/i)[0].trim() || artist;
  const clean = title.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || title;
  const get = (a, t, d) => `get?artist_name=${encodeURIComponent(a)}&track_name=${encodeURIComponent(t)}${d ? `&duration=${Math.round(d)}` : ''}`;
  for (const q of [...new Set([get(artist, title, durSec), get(mainArtist, title, durSec), get(mainArtist, clean, durSec), get(mainArtist, clean)])]) {
    const r = await lrclib(q);
    if (r && (r.syncedLyrics || r.instrumental)) return pack(r, durSec);
  }
  const list = (await lrclib(`search?q=${encodeURIComponent(mainArtist + ' ' + clean)}`)) || [];
  const scored = list.filter(r => r.syncedLyrics || r.plainLyrics)
    .map(r => ({ r, score: (r.syncedLyrics ? 0 : 1000) + (durSec ? Math.abs((r.duration || 0) - durSec) : 0) }))
    .sort((a, b) => a.score - b.score);
  return scored.length ? pack(scored[0].r, durSec) : null;
}
async function loadLyrics(force) {
  const key = nowPlaying.title ? `${nowPlaying.artist}|${nowPlaying.title}` : '';
  if (key === lyrics.key && !force) return;
  if (key !== lyrics.key) { songNudge = 0; autoHeld = false; if (key) shuffleNext(); broadcast(); refreshMenu(); }   // per-song nudge and a hand-picked style reset with the next song; Shuffle moves on
  // No track, or browser media with no artist (e.g. "(8) Instagram") — nothing to look up.
  if (!key || !nowPlaying.artist.trim()) { lyrics = { key, state: 'none', lines: [], plain: '', timing: null }; sendLyrics(); sendStatus(); return; }
  if (force) lyricCache.delete(key);
  lyrics = { key, state: 'loading', lines: [], plain: '', timing: null }; sendLyrics();
  await new Promise(r => setTimeout(r, 600)); // the timeline for a new track lands a moment after the track
  let r = lyricCache.get(key), failed = false;
  if (r === undefined) {
    try { r = await findLyrics(nowPlaying.title, nowPlaying.artist, timeline.dur ? timeline.dur / 1000 : 0); }
    catch (e) { log('lyrics fetch failed', e.message); r = null; failed = true; }
    if (!failed) lyricCache.set(key, r);
  }
  if (lyrics.key !== key) return;
  lyrics = !r ? { key, state: failed ? 'offline' : 'none', lines: [], plain: '', timing: null }
    : { key, state: r.lines.length ? 'synced' : r.instrumental ? 'instrumental' : r.plain ? 'plain' : 'none', lines: r.lines, plain: r.plain, source: r.source,
        timing: r.lines.length ? (r.lines.some(l => l.words) ? 'word' : 'line') : null };
  log('lyrics', key, lyrics.state, lyrics.timing, lyrics.lines.length + ' lines');
  const restyled = settings.lyricShuffle === 'auto' && lyrics.state === 'synced' && shuffleNext(true);   // Auto: choose now that the words are known
  if (settings.lyricShuffle === 'auto') armAutoTimer();
  if (restyled) { broadcast(); refreshMenu(); }
  sendLyrics(); sendStatus();
}

// ---------- player status (Verci's checklist) ----------
function helperState() {
  if (!mediaProc) return 'stopped';
  if (Date.now() - lastHelperMsg < 10000) return 'running';
  return Date.now() - helperStarted < 15000 ? 'starting' : 'stuck';
}
function sendStatus() {
  const st = { helper: helperState(), app: nowPlaying.app, title: nowPlaying.title, artist: nowPlaying.artist, status: nowPlaying.status,
    lyrics: lyrics.state, timing: lyrics.timing, lines: lyrics.lines.length, canSeek: timeline.canSeek, stage: stageWins.length > 0 };
  [stageWin, ...stageWins].forEach(w => send(w, 'status', st));
}

// Windows blocks background apps from stealing focus; nudge the window to the top.
function bringToFront(w) {
  if (!alive(w)) return;
  if (w.isMinimized()) w.restore();
  w.show(); w.setAlwaysOnTop(true); w.focus(); w.moveTop();
  setTimeout(() => alive(w) && w.setAlwaysOnTop(false), 1200);
}

function appIcon(s = 16) {
  const buf = Buffer.alloc(s * s * 4), c = (s - 1) / 2;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - c, y - c) / (s / 2), i = (y * s + x) * 4;
    if ((d < 0.95 && d > 0.55) || d <= 0.35) { const t = x / s; buf[i] = 0xff * (1 - t) + 0x4d * t | 0; buf[i + 1] = 0x3d; buf[i + 2] = 0xff * t + 0x4c * (1 - t) | 0; buf[i + 3] = 0xff; }
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}

// ---------- tray: only what you reach for mid-song ----------
// Rebuilding the native tray menu is slow; never do it on every slider tick.
let menuT = null;
function refreshMenu() { clearTimeout(menuT); menuT = setTimeout(refreshMenuNow, 300); }
function refreshMenuNow() {
  menuT = null;
  if (!tray || quitting || tray.isDestroyed()) return;                // a deferred rebuild can land mid-quit
  const np = nowPlaying.title ? `${nowPlaying.title} — ${nowPlaying.artist}` : 'Nothing playing';
  tray.setToolTip(`Auralyrics · ${np}`.slice(0, 127));
  const has = !!nowPlaying.title;
  const pinned = (settings.pinnedStyles || []).filter(k => STYLE_NAMES[k]);
  const disp = displayList();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: np.slice(0, 60), enabled: false },
    { label: playing() ? 'Pause' : 'Play', enabled: has, click: () => control('toggle') },
    { label: 'Next', enabled: has, click: () => control('next') },
    { label: 'Previous', enabled: has, click: () => control('prev') },
    { type: 'separator' },
    { label: 'Open Auralyrics', click: openHome },
    { type: 'separator' },
    { label: 'Style', enabled: false },
    ...(pinned.length ? pinned : [settings.lyricStyle]).map(k => ({ label: STYLE_NAMES[k], type: 'radio', checked: settings.lyricShuffle === 'off' && settings.lyricStyle === k, click: () => applyPatch({ lyricShuffle: 'off', lyricStyle: k }) })),
    { label: 'Shuffle styles', submenu: [['auto', 'Auto — fits the song and mixes it up'], ['off', 'Off'], ['song', 'New style every song'], ['minute', 'New style every minute']].map(([v, l]) => ({ label: l, type: 'radio', checked: settings.lyricShuffle === v, click: () => applyPatch({ lyricShuffle: v }) })) },
    { type: 'separator' },
    { label: 'Keep screen awake', type: 'checkbox', checked: settings.keepAwake, click: i => applyPatch({ keepAwake: i.checked }) },
    { label: 'Lyrics in full screen (H)', type: 'checkbox', checked: settings.stageLyrics, click: i => applyPatch({ stageLyrics: i.checked }) },
    { label: 'Show lyrics on desktop', type: 'checkbox', checked: settings.lyrics, click: i => applyPatch({ lyrics: i.checked }) },
    { label: stageWins.length ? 'Close full-screen lyrics' : 'Full-screen lyrics', accelerator: HOTKEY, click: toggleStage },
    { label: 'Move lyrics (unlock)', type: 'checkbox', checked: !settings.lyricLock, click: i => applyPatch({ lyricLock: !i.checked }) },
    { label: 'Text size', submenu: [70, 85, 100, 115, 130, 150, 175].map(p => ({ label: p + '%', type: 'radio', checked: settings.lyricScale === p, click: () => applyPatch({ lyricScale: p }) })) },
    { type: 'separator' },
    { label: 'Glow', type: 'checkbox', checked: settings.enabled, click: i => applyPatch({ enabled: i.checked }) },
    { label: 'Glow on the desktop too', type: 'checkbox', checked: settings.glowDesktop, enabled: settings.enabled, click: i => applyPatch({ glowDesktop: i.checked }) },
    { label: 'Glow style', submenu: GLOW_STYLES.map(([k, l]) => ({ label: l, type: 'radio', checked: settings.glowStyle === k, click: () => applyPatch({ glowStyle: k }) })) },
    { label: 'Glow display', submenu: [
      { label: 'All displays', type: 'radio', checked: settings.glowDisplays === 'all', click: () => applyPatch({ glowDisplays: 'all' }) },
      { label: 'Main display', type: 'radio', checked: settings.glowDisplays === 'main', click: () => applyPatch({ glowDisplays: 'main' }) },
      ...disp.map(d => ({ label: `${d.label} (${d.size})`, type: 'radio', checked: settings.glowDisplays === d.id, click: () => applyPatch({ glowDisplays: d.id }) }))] },
    { label: 'Follow album colors', type: 'checkbox', checked: settings.albumColors, click: i => applyPatch({ albumColors: i.checked }) },
    { type: 'separator' },
    updateMenuItem(),
    { label: 'Quit Auralyrics', click: () => app.quit() }
  ]));
}
function updateMenuItem() {
  const u = updater && updater.snapshot();
  if (u && u.status === 'ready') return { label: `Restart to update to v${u.version}`, click: () => updater.action() };
  if (u && u.status === 'available') return { label: `Update available: v${u.version} (open download page)`, click: () => updater.action() };
  if (u && u.status === 'downloading') return { label: `Downloading update v${u.version}… ${u.percent}%`, enabled: false };
  return { label: 'Check for updates', enabled: !u || u.status !== 'checking', click: () => updater && updater.check(true) };
}

function setStartup(v) {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath; // portable builds run from a temp dir
  app.setLoginItemSettings({ openAtLogin: v, path: exe, args: [...(app.isPackaged ? [] : [path.resolve(__dirname)]), '--hidden'] });
}

function applyPatch(patch) {
  if ('songNudge' in patch) { songNudge = Math.max(-10, Math.min(10, Math.round(patch.songNudge * 10) / 10)); delete patch.songNudge; }
  if (patch.resetLyricPos) { delete patch.resetLyricPos; patch.lyricBounds = null; if (alive(lyricsWin)) lyricsWin.setBounds(defaultLyricBounds()); }
  if (patch.resetColors) { delete patch.resetColors; patch.lyricColors = { ...DEFAULTS.lyricColors }; }
  if (patch.resetGlow) { delete patch.resetGlow; for (const k of ['thickness', 'glow', 'intensity', 'speed', 'idleBrightness', 'glowSplit']) patch[k] = DEFAULTS[k]; }
  settings = { ...settings, ...patch };
  // picking a style by hand while Shuffle is on holds it until Shuffle's next change
  if ('lyricStyle' in patch && settings.lyricShuffle !== 'off') { shuffleStyle = patch.lyricStyle; autoHeld = settings.lyricShuffle === 'auto'; }
  if ('lyricShuffle' in patch) autoHeld = false;
  // turning Auto / Shuffle off keeps the style that is on screen rather than snapping back to the one saved earlier
  if (patch.lyricShuffle === 'off' && !('lyricStyle' in patch) && shuffleStyle) settings.lyricStyle = shuffleStyle;
  if ('lyricShuffle' in patch || 'pinnedStyles' in patch) { if ('lyricShuffle' in patch) shuffleStyle = null; syncShuffle(); }
  if ('enabled' in patch || 'glowOverFullscreen' in patch || 'glowDesktop' in patch) updateOverlays();
  if ('glowDisplays' in patch) buildOverlays();
  if ('startup' in patch) setStartup(patch.startup);
  if ('lyricLock' in patch) applyLock();
  if ('lyrics' in patch) updateLyricsVisibility();
  if ('keepAwake' in patch) updateAwake();
  if ('stageDisplays' in patch && stageWins.length) { const back = returnHome; closeStage(false); setTimeout(() => { openStage(); returnHome = back; }, 300); }
  save(); broadcast(); refreshMenu();
}

function control(cmd, arg) {
  if (!mediaProc || !mediaProc.stdin.writable) return;
  if (['toggle', 'next', 'prev'].includes(cmd)) mediaProc.stdin.write(cmd + '\n');
  if (cmd === 'seek' && Number.isFinite(arg)) mediaProc.stdin.write(`seek ${Math.round(arg)}\n`);
}

// ---------- system audio (loopback) analysed in a hidden window ----------
function startAudio() {
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(src => cb({ video: src[0], audio: 'loopback' }));
  });
  audioWin = new BrowserWindow({ show: false, webPreferences: { preload, backgroundThrottling: false } });
  audioWin.loadFile('audio.html');
  audioWin.webContents.once('did-finish-load', () => nowPlaying.art && send(audioWin, 'extract', nowPlaying.art));
}

// ---------- now playing via Windows media controls ----------
function ownPid(pid) { return app.getAppMetrics().some(m => m.pid === pid); }
function startMedia(delay = 0) {
  setTimeout(() => {
    if (quitting) return;
    helperStarted = Date.now();
    mediaProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', unpacked('media.ps1')], { windowsHide: true });
    const me = mediaProc;
    readline.createInterface({ input: mediaProc.stdout }).on('line', line => {
      let m; try { m = JSON.parse(line); } catch { return; }
      lastHelperMsg = Date.now();
      if (m.type === 'hb') return;
      if (m.type === 'fg') {
        let id = null;
        if (m.fs && !ownPid(m.pid)) {
          try { id = screen.getDisplayMatching(screen.screenToDipRect(null, { x: m.x, y: m.y, width: m.w, height: m.h })).id; } catch { id = null; }
        }
        if (id !== fsDisplayId) { fsDisplayId = id; updateOverlays(); }
        return;
      }
      if (m.type === 'time') {
        const statusChanged = m.status !== nowPlaying.status;
        timeline = { pos: m.pos, dur: m.dur, upd: m.upd, status: m.status, canSeek: !!m.canSeek };
        nowPlaying.status = m.status;
        sendTime();
        if (statusChanged) { broadcast(); sendNow(); refreshMenu(); updateAwake(); sendStatus(); }
        return;
      }
      const art = m.art ? `data:image/png;base64,${m.art}` : '';
      const artChanged = art !== nowPlaying.art;
      nowPlaying = { title: m.title || '', artist: m.artist || '', status: m.status, app: m.app || '', art };
      if (artChanged) { if (art) send(audioWin, 'extract', art); else { artColors = null; broadcast(); } }
      else broadcast();
      sendNow(); refreshMenu(); updateLyricsVisibility(); updateAwake(); loadLyrics(); sendStatus();
    });
    mediaProc.stderr.on('data', d => log('media:', String(d).trim()));
    mediaProc.on('exit', code => { log('media helper exited', code); if (mediaProc === me) { mediaProc = null; startMedia(me._fast ? 200 : 3000); } });
  }, delay);
}
function reconnect() {
  log('reconnect requested');
  if (mediaProc) { mediaProc._fast = true; try { mediaProc.stdin.end(); } catch {} mediaProc.kill(); } else startMedia(0);
  loadLyrics(true);
}

// ---------- IPC ----------
ipcMain.on('set', (_e, patch) => applyPatch(patch));
// the floating lyrics window only takes the mouse while the pointer is over its hover bar
ipcMain.on('lyricsHit', (_e, hit) => { if (alive(lyricsWin) && settings.lyricLock) lyricsWin.setIgnoreMouseEvents(!hit, { forward: true }); });
ipcMain.on('control', (_e, cmd, arg) => control(cmd, arg));
ipcMain.on('reconnect', reconnect);
ipcMain.on('updateAction', () => updater && updater.action());
ipcMain.on('stage', (_e, on) => on ? openStage() : closeStage());
ipcMain.on('level', (_e, lv) => { overlays.forEach(w => send(w, 'level', lv)); uiWindows().forEach(w => send(w, 'level', lv)); });
ipcMain.on('artColors', (_e, cols) => { artColors = cols; broadcast(); sendNow(); log('colors', nowPlaying.title, cols.join(' ')); });

app.on('second-instance', () => settings.openFullOnLaunch ? openStage() : openHome());
app.whenReady().then(() => {
  log('start', { version: app.getVersion(), packaged: app.isPackaged });
  load(); syncShuffle();
  updater = createUpdater({ app, net, shell, Notification, log, icon: () => appIcon(64), enabled: () => settings.autoUpdateCheck, onChange: () => { broadcast(); refreshMenu(); } });
  settings.startup = app.getLoginItemSettings({ path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }).openAtLogin;
  buildOverlays();
  buildLyricsWin();
  tray = new Tray(appIcon(16));
  tray.on('click', openHome);
  refreshMenuNow();                                                   // the tray needs its menu right away
  startAudio();
  startMedia();
  updater.start();
  // Started with Windows → stay in the tray. Opened by hand → go straight to the main view.
  const hidden = process.argv.includes('--hidden');
  if (process.env.AURALYRICS_SHOT) openStage();
  else if (!hidden) settings.openFullOnLaunch ? openStage() : openHome();
  if (!hidden && Notification.isSupported()) {
    const n = new Notification({ title: 'Auralyrics is running', body: 'Ctrl + Alt + L toggles full-screen lyrics. Settings live in the tray icon (bottom-right, ^).', icon: appIcon(64) });
    n.on('click', openHome); n.show();
  }
  let t; const rebuild = () => { clearTimeout(t); t = setTimeout(() => { buildOverlays(); refreshMenu(); }, 400); };
  screen.on('display-added', rebuild); screen.on('display-removed', rebuild); screen.on('display-metrics-changed', rebuild);
  powerMonitor.on('lock-screen', () => setResting(true));
  powerMonitor.on('unlock-screen', () => setResting(false));
  powerMonitor.on('suspend', () => setResting(true));
  powerMonitor.on('resume', () => setResting(false));
  if (!globalShortcut.register(HOTKEY, toggleStage)) log('hotkey unavailable', HOTKEY);
  setInterval(sendStatus, 2000);
  log('ready');
}).catch(e => log('startup failed', e));
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; if (mediaProc) { try { mediaProc.stdin.end(); } catch {} mediaProc.kill(); } });
app.on('window-all-closed', e => e.preventDefault()); // keep running in the tray
