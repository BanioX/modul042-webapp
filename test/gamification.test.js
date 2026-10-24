const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeXp, levelFor, computeStreak, computeBadges, XP,
} = require('../src/gamification');

test('XP für Abgaben, Pünktlichkeit, gute Noten und Forum', () => {
  const xp = computeXp({
    submissions: [{ onTime: true, grade: 6 }, { onTime: false, grade: 4.5 }],
    threads: 1,
    replies: 2,
    likesReceived: 3,
  });
  assert.equal(xp, XP.submission * 2 + XP.onTime + XP.gradeSix + XP.thread + XP.reply * 2 + XP.likeReceived * 3);
});

test('Level alle 100 XP', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(99).level, 1);
  assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(250).progress, 50);
  assert.equal(levelFor(250).needed, 50);
});

test('Streak zählt aufeinanderfolgende Tage bis heute oder gestern', () => {
  const today = new Date('2026-10-24T10:00:00Z');
  assert.equal(computeStreak(['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-20'], today), 3);
  assert.equal(computeStreak(['2026-10-23', '2026-10-22'], today), 2);
  assert.equal(computeStreak(['2026-10-21'], today), 0);
});

test('Abzeichen', () => {
  const badges = computeBadges({ submissions: [{ onTime: true, grade: 6 }], openTasks: 0 });
  const earned = badges.filter((b) => b.earned).map((b) => b.id);
  assert.ok(earned.includes('first'));
  assert.ok(earned.includes('six'));
  assert.ok(earned.includes('clean'));
  assert.ok(!earned.includes('helper'));
});
