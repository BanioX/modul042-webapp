// Stellt sicher, dass Produktblatt, Bot und FAQ zum aktuellen Funktionsumfang passen (siehe CLAUDE.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const features = require('../src/data/features.json');
const { renderProduktblatt } = require('../scripts/produktblatt');

const ROOT = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

test('Jeder Tab der App ist im Funktionskatalog beschrieben', () => {
  const navBlock = appJs.slice(appJs.indexOf('const NAV = ['), appJs.indexOf('];', appJs.indexOf('const NAV = [')));
  const tabs = [...navBlock.matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 8);
  const ids = new Set(features.map((f) => f.id));
  for (const tab of [...tabs, 'verwaltung']) assert.ok(ids.has(tab), `Tab "${tab}" fehlt in src/data/features.json`);
});

test('Jede Funktion hat Titel, Text, Stichwörter und eine FAQ-Antwort', () => {
  for (const f of features) {
    assert.ok(f.title && f.text && f.icon, `${f.id}: Titel/Text/Icon fehlt`);
    assert.ok(f.faq && f.faq.keywords.length > 0 && f.faq.answer.length > 40, `${f.id}: FAQ-Antwort fehlt`);
  }
});

test('Produktblatt ist auf dem neuesten Stand (node scripts/build-produktblatt.js)', () => {
  const committed = fs.readFileSync(path.join(ROOT, 'docs/produktblatt.html'), 'utf8');
  assert.equal(committed, renderProduktblatt(), 'docs/produktblatt.html veraltet: node scripts/build-produktblatt.js ausführen');
  for (const f of features) assert.ok(committed.includes(f.title.replace(/&/g, '&amp;')), `Produktblatt erwähnt "${f.title}" nicht`);
});

test('Bot kennt alle Funktionen', async () => {
  const { localAnswer } = require('../src/bot/local');
  const pool = { query: async () => ({ rows: [] }) };
  for (const f of features) {
    const res = await localAnswer({ pool, user: { id: 1, display_name: 'Test' }, question: `Was ist ${f.faq.keywords[0]}?` });
    assert.ok(!res.fallback, `Bot beantwortet "${f.faq.keywords[0]}" (${f.id}) nicht`);
  }
});
