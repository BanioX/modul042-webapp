const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRecoveryId, normalizeRecoveryId, ALPHABET } = require('../src/recovery');

test('Wiederherstellungs-ID hat das Format XXXX-XXXX ohne verwechselbare Zeichen', () => {
  for (let i = 0; i < 200; i += 1) {
    const id = generateRecoveryId();
    assert.match(id, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const c of id.replace('-', '')) assert.ok(ALPHABET.includes(c));
  }
});

test('IDs sind zufällig', () => {
  const ids = new Set(Array.from({ length: 500 }, generateRecoveryId));
  assert.equal(ids.size, 500);
});

test('Eingabe wird tolerant normalisiert', () => {
  assert.equal(normalizeRecoveryId(' k7q2-m9xa '), 'K7Q2M9XA');
  assert.equal(normalizeRecoveryId('K7Q2 M9XA'), 'K7Q2M9XA');
});
