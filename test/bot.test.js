const test = require('node:test');
const assert = require('node:assert/strict');
const { findBotAnswer, faq } = require('../src/bot');

test('FAQ contains all 5 required topics', () => {
  const ids = faq.map((f) => f.id);
  assert.ok(ids.includes('notenformel'), 'Missing notenformel topic');
  assert.ok(ids.includes('anonymitaet'), 'Missing anonymitaet topic');
  assert.ok(ids.includes('konto_loeschen'), 'Missing konto_loeschen topic');
  assert.ok(ids.includes('passwort_vergessen'), 'Missing passwort_vergessen topic');
  assert.ok(ids.includes('betreiber'), 'Missing betreiber topic');
});

test('findBotAnswer handles questions about grade calculation', () => {
  const res = findBotAnswer('Wie wird die Note berechnet?');
  assert.ok(res.matched);
  assert.equal(res.topic, 'notenformel');
  assert.ok(res.reply.includes('Note = (Punkte / Max-Punkte) × 5 + 1'));
});

test('findBotAnswer handles questions about anonymity and privacy', () => {
  const res = findBotAnswer('Ist mein Name in der Rangliste sichtbar?');
  assert.ok(res.matched);
  assert.equal(res.topic, 'anonymitaet');
  assert.ok(res.reply.includes('Student #'));
});

test('findBotAnswer returns fallback with suggestions for unknown input', () => {
  const res = findBotAnswer('Wie wird das Wetter morgen?');
  assert.equal(res.matched, false);
  assert.ok(res.suggestions.length > 0);
});
