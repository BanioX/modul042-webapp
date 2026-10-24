const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRanking, rankingSummary } = require('../src/ranking');

const rows = [
  { user_id: 1, grade: 4.8, percent: 75 },
  { user_id: 1, grade: 5.8, percent: 95 },
  { user_id: 2, grade: 6.0, percent: 100 },
  { user_id: 3, grade: 4.0, percent: 60 },
  { user_id: 4, grade: null, percent: null },
];

test('Ranking sortiert nach Notenschnitt', () => {
  const ranking = buildRanking(rows, 1, 'Alban');
  assert.deepEqual(ranking.map((r) => r.avgGrade), [6, 5.3, 4]);
  assert.equal(ranking[1].rank, 2);
});

test('Nur der eigene Name ist sichtbar, andere sind anonym und ohne User-ID', () => {
  const ranking = buildRanking(rows, 1, 'Alban');
  const me = ranking.filter((r) => r.isMe);
  assert.equal(me.length, 1);
  assert.equal(me[0].name, 'Alban');
  for (const r of ranking.filter((x) => !x.isMe)) {
    assert.equal(r.name, 'Anonym');
    assert.equal(r.userId, undefined);
  }
  assert.ok(!JSON.stringify(ranking).includes('userId'));
});

test('Aufgaben ohne Punkte zählen nicht', () => {
  const ranking = buildRanking(rows, 4);
  assert.equal(ranking.length, 3);
  assert.equal(ranking.some((r) => r.isMe), false);
});

test('Gleicher Schnitt ergibt gleichen Rang', () => {
  const ranking = buildRanking([
    { user_id: 1, grade: 5, percent: 80 },
    { user_id: 2, grade: 5, percent: 80 },
    { user_id: 3, grade: 4, percent: 60 },
  ], 3);
  assert.deepEqual(ranking.map((r) => r.rank), [1, 1, 3]);
});

test('Zusammenfassung mit Prozentrang', () => {
  const summary = rankingSummary(buildRanking(rows, 1));
  assert.equal(summary.total, 3);
  assert.equal(summary.me.rank, 2);
  assert.equal(summary.betterThan, 50);
});

test('Kleine Gruppen: andere werden ausgeblendet (k-Anonymität)', () => {
  const { protectSmallGroups } = require('../src/ranking');
  const two = buildRanking([{ user_id: 1, grade: 5, percent: 80 }, { user_id: 2, grade: 4, percent: 60 }], 1);
  const safe = protectSmallGroups(two);
  assert.equal(safe.hidden, true);
  assert.equal(safe.ranking.length, 1);
  assert.equal(safe.ranking[0].isMe, true);
  assert.equal(safe.ranking[0].rank, null);
  const three = buildRanking(rows, 1);
  assert.equal(protectSmallGroups(three).hidden, false);
});
