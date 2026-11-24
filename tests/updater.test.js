const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer, parseVersion, parseRelease } = require('../updater');

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
  assert.equal(isNewer('nonsense', '2.0.0'), false);
  assert.equal(isNewer('2.1.0', 'nonsense'), false);
});

test('parseRelease ignores drafts, pre-releases and bad tags', () => {
  assert.deepEqual(parseRelease({ tag_name: 'v2.1.0' }), { version: '2.1.0' });
  assert.equal(parseRelease({ tag_name: 'v2.1.0', draft: true }), null);
  assert.equal(parseRelease({ tag_name: 'v2.1.0', prerelease: true }), null);
  assert.equal(parseRelease({ tag_name: 'nightly' }), null);
  assert.equal(parseRelease(null), null);
  assert.equal(parseRelease({ message: 'Not Found' }), null);
});
