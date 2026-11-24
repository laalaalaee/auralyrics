const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { createUpdater, isNewer, parseVersion, parseRelease, comparePre, RELEASES_URL } = require('../updater');

// ---------- version helpers ----------
test('parseVersion reads plain and v-prefixed versions', () => {
  assert.deepEqual(parseVersion('2.1.0'), { n: [2, 1, 0], pre: '' });
  assert.deepEqual(parseVersion('v2.1.0'), { n: [2, 1, 0], pre: '' });
  assert.deepEqual(parseVersion('2.1.0-beta.1'), { n: [2, 1, 0], pre: 'beta.1' });
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(undefined), null);
});

test('isNewer compares numbers, not strings', () => {
  assert.equal(isNewer('2.1.0', '2.0.0'), true);
  assert.equal(isNewer('v2.0.1', '2.0.0'), true);
  assert.equal(isNewer('2.10.0', '2.9.0'), true);      // 10 > 9, not "1" < "9"
  assert.equal(isNewer('3.0.0', '2.99.99'), true);
  assert.equal(isNewer('2.0.0', '2.0.0'), false);
  assert.equal(isNewer('1.9.9', '2.0.0'), false);
});

test('isNewer handles pre-releases and junk', () => {
  assert.equal(isNewer('2.1.0', '2.1.0-beta.1'), true);
  assert.equal(isNewer('2.1.0-beta.1', '2.1.0'), false);
  assert.equal(isNewer('2.1.0-beta.2', '2.1.0-beta.1'), true);
  assert.equal(isNewer('2.1.0-beta.10', '2.1.0-beta.9'), true);   // numeric parts compare as numbers
  assert.equal(isNewer('2.1.0-rc.1', '2.1.0-beta.5'), true);
  assert.equal(isNewer('nonsense', '2.0.0'), false);
  assert.equal(isNewer('2.1.0', 'nonsense'), false);
});

test('comparePre follows semver pre-release order', () => {
  assert.ok(comparePre('beta.10', 'beta.9') > 0);
  assert.ok(comparePre('beta.1', 'beta') > 0);       // more parts win when the shared ones match
  assert.ok(comparePre('alpha', '1') > 0);           // words rank above numbers
  assert.ok(comparePre('rc', 'beta') > 0);
  assert.equal(comparePre('beta.2', 'beta.2'), 0);
});

test('parseRelease ignores drafts, pre-releases and bad tags', () => {
  assert.deepEqual(parseRelease({ tag_name: 'v2.1.0' }), { version: '2.1.0' });
  assert.equal(parseRelease({ tag_name: 'v2.1.0', draft: true }), null);
  assert.equal(parseRelease({ tag_name: 'v2.1.0', prerelease: true }), null);
  assert.equal(parseRelease({ tag_name: 'nightly' }), null);
  assert.equal(parseRelease(null), null);
  assert.equal(parseRelease({ message: 'Not Found' }), null);
});

// ---------- createUpdater with fake Electron pieces ----------
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function rig({ packaged = false, version = '2.1.0', fetchReply = reply(200, { tag_name: 'v2.1.0' }), autoUpdater } = {}) {
  delete process.env.PORTABLE_EXECUTABLE_FILE;
  const toasts = [], opened = [], clicks = [];
  class FakeNotification {
    constructor(o) { this.o = o; }
    static isSupported() { return true; }
    on(_ev, f) { clicks.push(f); }
    show() { toasts.push(this.o.title); }
  }
  const u = createUpdater({
    app: { isPackaged: packaged, getVersion: () => version },
    net: { fetch: async () => { if (fetchReply instanceof Error) throw fetchReply; return fetchReply; } },
    shell: { openExternal: url => opened.push(url) },
    Notification: FakeNotification, log() {}, icon: null, enabled: () => true, onChange() {}, autoUpdater
  });
  return { u, toasts, opened, clicks };
}

test('notice mode: a newer release is announced once and opens the release page', async () => {
  const r = rig({ fetchReply: reply(200, { tag_name: 'v2.2.0' }) });
  await r.u.check(false);
  assert.equal(r.u.snapshot().status, 'available');
  assert.equal(r.u.snapshot().version, '2.2.0');
  assert.deepEqual(r.toasts, ['Auralyrics update available']);
  await r.u.check(true);                                     // checking again does not repeat the notice
  assert.equal(r.toasts.length, 1);
  r.u.action();
  assert.deepEqual(r.opened, [RELEASES_URL]);
});

test('notice mode: up to date is only announced for a manual check', async () => {
  const r = rig();
  await r.u.check(false);
  assert.equal(r.u.snapshot().status, 'none');
  assert.deepEqual(r.toasts, []);
  await r.u.check(true);
  assert.deepEqual(r.toasts, ['Auralyrics is up to date']);
});

test('notice mode: a failed check sets error, and only a manual one says so', async () => {
  const r = rig({ fetchReply: reply(404, { message: 'Not Found' }) });
  await r.u.check(false);
  assert.equal(r.u.snapshot().status, 'error');
  assert.deepEqual(r.toasts, []);
  await r.u.check(true);
  assert.deepEqual(r.toasts, ['Could not check for updates']);
});

class FakeAutoUpdater extends EventEmitter {
  constructor(script) { super(); this.script = script; this.installs = 0; }
  async checkForUpdates() { return this.script(this); }
  quitAndInstall() { this.installs++; }
}

test('installed mode: download, ready notice, and Restart to update installs', async () => {
  const au = new FakeAutoUpdater(a => {
    a.emit('update-available', { version: '2.2.0' });
    a.emit('download-progress', { percent: 41.6 });
    return { updateInfo: { version: '2.2.0' } };
  });
  const r = rig({ packaged: true, autoUpdater: au });
  r.u.start();
  await r.u.check(true);
  assert.equal(r.u.snapshot().mode, 'installed');
  assert.equal(r.u.snapshot().status, 'downloading');
  assert.equal(r.u.snapshot().percent, 42);
  await r.u.check(true);                                     // no new check while a download runs
  au.emit('update-downloaded', { version: '2.2.0' });
  assert.equal(r.u.snapshot().status, 'ready');
  assert.deepEqual(r.toasts, ['Auralyrics update ready']);
  r.u.action();
  assert.equal(au.installs, 1);
});

test('installed mode: an inactive updater (null result) does not stay stuck on checking', async () => {
  const r = rig({ packaged: true, autoUpdater: new FakeAutoUpdater(() => null) });
  r.u.start();
  await r.u.check(true);
  assert.equal(r.u.snapshot().status, 'error');
  assert.deepEqual(r.toasts, ['Could not check for updates']);
});

test('installed mode: up to date and errors from the updater', async () => {
  let mode = 'none';
  const au = new FakeAutoUpdater(a => {
    if (mode === 'none') { a.emit('update-not-available', {}); return { updateInfo: { version: '2.1.0' } }; }
    const e = new Error('HttpError: 404\n"headers": {...}'); a.emit('error', e); throw e;
  });
  const r = rig({ packaged: true, autoUpdater: au });
  r.u.start();
  await r.u.check(true);
  assert.equal(r.u.snapshot().status, 'none');
  assert.deepEqual(r.toasts, ['Auralyrics is up to date']);
  mode = 'error';
  await r.u.check(true);
  assert.equal(r.u.snapshot().status, 'error');
  assert.deepEqual(r.toasts, ['Auralyrics is up to date', 'Could not check for updates']);   // one error notice, not two
});
