// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickStyle, signals } = require('../autostyle');

const ALL = ['ship', 'fisheye', 'visual', 'fisheyeVisual', 'codestyle', 'codestyleVisual', 'branches', 'web', 'constellation',
  'messages', 'money', 'map', 'notifications', 'stack', 'karaoke', 'minimal', 'poster'];
const PINNED = ['visual', 'messages', 'codestyle', 'stack', 'poster'];

// small seeded RNG so the weighted picks are reproducible
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const song = (n, words, secEach, hook) => Array.from({ length: n }, (_, i) => ({ t: i * secEach * 1000, text: (hook && i % 3 === 0 ? hook + ' ' : '') + Array(words).fill('la').join(' ') }));
const share = (lines, pool, style, hour = 14, runs = 2000) => {
  const r = rng(7); let hit = 0;
  for (let i = 0; i < runs; i++) if (pickStyle({ lines, pool, current: 'visual', hour, rand: r }).style === style) hit++;
  return hit / runs;
};

test('never returns the style that is already on screen', () => {
  const r = rng(1);
  for (let i = 0; i < 500; i++) assert.notEqual(pickStyle({ lines: song(40, 5, 3), pool: PINNED, current: 'stack', rand: r }).style, 'stack');
});

test('keeps the current style when it is the only one in the pool', () => {
  assert.equal(pickStyle({ lines: [], pool: ['visual'], current: 'visual' }).style, 'visual');
});

test('money lyrics favour the Money screen', () => {
  assert.ok(share(song(60, 5, 3, 'cash money bands'), ALL, 'money') > 0.5);
});

test('place lyrics favour the Maps screen', () => {
  assert.ok(share(song(50, 6, 4, 'driving down the highway'), ALL, 'map') > 0.5);
});

test('chatty short lines favour the message styles', () => {
  const lines = song(70, 3, 2.5, 'text me baby');
  assert.ok(share(lines, ALL, 'messages') + share(lines, ALL, 'notifications') > 0.5);
});

test('slow, long lines lean to calm styles within the pinned pool', () => {
  const lines = song(30, 9, 7);
  assert.ok(share(lines, PINNED, 'stack') + share(lines, PINNED, 'poster') > 0.7);
});

test('late at night nudges towards quieter styles', () => {
  const lines = song(30, 9, 7);
  assert.ok(share(lines, PINNED, 'poster', 23) > share(lines, PINNED, 'poster', 14));
});

test('every style in the pool stays possible (never fully predictable)', () => {
  const r = rng(3), seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(pickStyle({ lines: song(40, 5, 3), pool: PINNED, current: 'visual', rand: r }).style);
  assert.equal(seen.size, PINNED.length - 1);
});

test('signals are clamped to 0..1 and empty lyrics are handled', () => {
  const s = signals(song(200, 1, 0.5, 'cash money'), 60000, 3);
  for (const k of ['fast', 'slow', 'short', 'long', 'money', 'place', 'sky', 'talk', 'night']) assert.ok(s[k] >= 0 && s[k] <= 1, k);
  assert.equal(signals([], 0, 12).n, 0);
  assert.equal(pickStyle({ lines: [], pool: PINNED, current: 'visual' }).reason, 'no lyrics');
});
