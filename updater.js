'use strict';
// Update checks.
//  - Installed build: electron-updater reads the GitHub Release (latest.yml), downloads the new installer in the
//    background and installs it the next time the app quits, or right away from "Restart to update".
//  - Portable build (and a dev run): a portable exe cannot replace itself, so we only tell the person a newer
//    version exists and send them to the release page.
// Nothing is sent except a normal request to GitHub. No account, no id, no analytics.

const OWNER = 'laalaalaee', REPO = 'auralyrics';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const FIRST_CHECK_MS = 30 * 1000;           // not at launch: let the app settle first
const EVERY_MS = 6 * 60 * 60 * 1000;

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(v || '').trim());
  return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null;
}

// true only when `remote` is a higher version than `local`. Anything unparseable counts as "not newer".
function isNewer(remote, local) {
  const a = parseVersion(remote), b = parseVersion(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.n[i] !== b.n[i]) return a.n[i] > b.n[i];
  if (a.pre === b.pre) return false;
  if (!a.pre) return true;                  // 2.1.0 is newer than 2.1.0-beta
  if (!b.pre) return false;
  return a.pre > b.pre;
}

// the bits we use from GitHub's "latest release" reply; drafts and pre-releases are ignored
function parseRelease(json) {
  if (!json || json.draft || json.prerelease) return null;
  const version = String(json.tag_name || '').replace(/^v/, '');
  return parseVersion(version) ? { version } : null;
}

function createUpdater({ app, net, shell, Notification, log, icon, enabled, onChange }) {
  const portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
  const mode = app.isPackaged && !portable ? 'installed' : portable ? 'portable' : 'dev';
  const st = { mode, status: 'idle', version: '', percent: 0 };
  // status: idle | checking | none | available (notice only) | downloading | ready | error
  let au = null, checking = false, manual = false, notified = '';

  const set = patch => {
    let changed = false;
    for (const k in patch) if (st[k] !== patch[k]) { st[k] = patch[k]; changed = true; }
    if (changed) onChange();
  };
  const toast = (title, body, click) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: icon && icon() });
    if (click) n.on('click', click);
    n.show();
  };
  const openPage = () => shell.openExternal(RELEASES_URL);
  const install = () => { if (au && st.status === 'ready') au.quitAndInstall(false, true); };

  function announce() {                      // once per version per run
    if (notified === st.version) return;
    notified = st.version;
    if (mode === 'installed') toast('Auralyrics update ready', `Version ${st.version} is downloaded. Restart from the tray to finish, or it installs when you quit.`, install);
    else toast('Auralyrics update available', `Version ${st.version} is out. Click to open the download page.`, openPage);
  }
  function fail(e) {
    log('update check failed', e && e.message || String(e));
    set({ status: 'error' });
    if (manual) toast('Could not check for updates', 'Check your connection and try again.');
  }

  function setupInstalled() {
    const { autoUpdater } = require('electron-updater');
    au = autoUpdater;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    au.logger = { info: (...a) => log('updater', ...a), warn: (...a) => log('updater warn', ...a), error: (...a) => log('updater error', ...a), debug() {} };
    au.on('update-available', i => set({ status: 'downloading', version: i.version, percent: 0 }));
    au.on('update-not-available', () => { set({ status: 'none' }); if (manual) toast('Auralyrics is up to date', `You have the latest version (${app.getVersion()}).`); });
    au.on('download-progress', p => set({ percent: Math.round(p.percent) }));
    au.on('update-downloaded', i => { set({ status: 'ready', version: i.version, percent: 100 }); announce(); });
    au.on('error', fail);
  }

  async function checkNotice() {
    const res = await net.fetch(API_URL, { headers: { 'User-Agent': `Auralyrics/${app.getVersion()}`, Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('GitHub answered ' + res.status);
    const rel = parseRelease(await res.json());
    if (rel && isNewer(rel.version, app.getVersion())) { set({ status: 'available', version: rel.version }); announce(); }
    else { set({ status: 'none' }); if (manual) toast('Auralyrics is up to date', `You have the latest version (${app.getVersion()}).`); }
  }

  async function check(isManual) {
    if (checking || st.status === 'downloading' || st.status === 'ready') return;
    checking = true; manual = !!isManual;
    set({ status: 'checking' });
    try {
      if (au) await au.checkForUpdates(); else await checkNotice();   // installed builds finish through au's events
    } catch (e) { if (st.status !== 'error') fail(e); }
    finally { checking = false; manual = false; }
  }

  function start() {
    if (mode === 'installed') { try { setupInstalled(); } catch (e) { log('updater unavailable', e); return; } }
    const tick = () => { if (enabled()) check(false); };
    setTimeout(tick, FIRST_CHECK_MS);
    setInterval(tick, EVERY_MS);
  }

  // what the tray item and the Settings button do right now
  function action() {
    if (st.status === 'ready') install();
    else if (st.status === 'available') openPage();
    else check(true);
  }

  return { start, check, action, snapshot: () => ({ ...st, current: app.getVersion() }) };
}

module.exports = { createUpdater, isNewer, parseVersion, parseRelease, RELEASES_URL };
