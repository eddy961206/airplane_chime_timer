const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('store metadata has valid English and Korean localized titles and summaries', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extensionName__');
  assert.equal(manifest.description, '__MSG_extensionDescription__');
  for (const locale of ['en', 'ko']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', locale, 'messages.json')));
    assert.ok(messages.extensionName.message.startsWith('Airplane Chime Timer'));
    assert.ok([...messages.extensionName.message].length <= 75);
    assert.ok([...messages.extensionDescription.message].length <= 132);
  }
});
