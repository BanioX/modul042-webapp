const test = require('node:test');
const assert = require('node:assert/strict');
const { redact, faqAnswer } = require('../src/routes/assistant');

test('Bot schwärzt E-Mail-Adressen und Telefonnummern', () => {
  const out = redact('Ich bin alban.hyseni@stud.hkv.ch, Tel. 079 123 45 67');
  assert.ok(!out.includes('@'));
  assert.ok(!out.includes('079'));
  assert.ok(out.includes('[E-Mail entfernt]'));
});

test('Bot kürzt lange Fragen', () => {
  assert.equal(redact('a'.repeat(2000)).length, 500);
});

test('Lokale FAQ findet passende Antworten', () => {
  assert.match(faqAnswer('Wie wird die Note berechnet?'), /Punkte × 5/);
  assert.match(faqAnswer('Wie mache ich den Check-in?'), /0.5 LLP/);
  assert.equal(faqAnswer('Wie ist das Wetter?'), null);
});
