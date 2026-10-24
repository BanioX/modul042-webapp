const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLlp } = require('../src/llp');

// Beispiel aus dem HKV-Leistungsausweis: Informationssysteme gestalten = 140 LLP möglich
const modules = [{ code: 'InfSys', name: 'Informationssysteme gestalten' }];
const lessons = Array.from({ length: 11 }, (_, i) => ({
  id: i + 1, module_code: 'InfSys', lektionen: 4, date: `2025-1${i < 9 ? 0 : 1}-${String(i + 10).padStart(2, '0')}`,
}));
const tasks = [
  { module_code: 'InfSys', kind: 'Mastery Test', max_points: 28, points: 24 },
  { module_code: 'InfSys', kind: 'ATL', max_points: 50, points: 41 },
  { module_code: 'InfSys', kind: 'ATL', max_points: 40, points: 30 },
  { module_code: null, kind: 'Jahresprüfung', max_points: 100, points: 61 },
  { module_code: null, kind: 'Abgabe', max_points: null, points: null },
];

test('0.5 LLP pro Lektion plus Maximalpunkte ergibt LLP möglich', () => {
  const res = computeLlp({ modules, lessons, attended: new Set(), tasks, today: '2026-12-31' });
  const infsys = res.modules.find((m) => m.code === 'InfSys');
  assert.equal(infsys.presence.possible, 22);
  assert.equal(infsys.possible, 140);
});

test('Note = erreicht / möglich × 5 + 1 (wie im Leistungsausweis)', () => {
  const attended = new Set(lessons.slice(0, 10).map((l) => l.id)); // 20 von 22 Präsenz-LLP, Beispielwerte
  const res = computeLlp({ modules, lessons, attended, tasks, today: '2026-12-31' });
  const infsys = res.modules.find((m) => m.code === 'InfSys');
  assert.equal(infsys.earned, 115);
  assert.equal(infsys.grade, 5.1);
});

test('Jahresprüfung als eigene Zeile, Aufgaben ohne Punkte zählen nicht', () => {
  const res = computeLlp({ modules, lessons, attended: new Set(), tasks, today: '2026-12-31' });
  const jp = res.modules.find((m) => m.code === 'JP');
  assert.equal(jp.possible, 100);
  assert.equal(jp.earned, 61);
  assert.equal(res.total.possible, 240);
});

test('Zwischenstand berücksichtigt nur Vergangenes und Bewertetes', () => {
  const res = computeLlp({
    modules,
    lessons,
    attended: new Set([1, 2]),
    tasks: [{ module_code: 'InfSys', kind: 'ATL', max_points: 50, points: null }],
    today: '2025-10-11',
  });
  const infsys = res.modules.find((m) => m.code === 'InfSys');
  assert.equal(infsys.possibleSoFar, 4);
  assert.equal(infsys.grade, null);
  assert.equal(infsys.gradeSoFar, 6);
});
