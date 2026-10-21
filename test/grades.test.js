const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateSwissGrade,
  roundGrade,
  pointsNeededForGrade,
  neededPointsTable,
  GRADE_ROUNDING_STEP,
} = require('../src/grades');

test('roundGrade rounds to nearest step (0.1)', () => {
  assert.equal(roundGrade(4.82), 4.8);
  assert.equal(roundGrade(4.86), 4.9);
  assert.equal(roundGrade(5.0), 5.0);
});

test('calculateSwissGrade calculates exact Swiss note formula', () => {
  // note = points / max * 5 + 1
  // 60 / 80 * 5 + 1 = 0.75 * 5 + 1 = 4.75 -> rounded 4.8
  assert.equal(calculateSwissGrade(60, 80), 4.8);

  // 38 / 40 * 5 + 1 = 0.95 * 5 + 1 = 5.75 -> rounded 5.8
  assert.equal(calculateSwissGrade(38, 40), 5.8);

  // 10 / 10 * 5 + 1 = 6.0
  assert.equal(calculateSwissGrade(10, 10), 6.0);

  // 0 / 100 * 5 + 1 = 1.0
  assert.equal(calculateSwissGrade(0, 100), 1.0);
});

test('calculateSwissGrade clamps between 1.0 and 6.0', () => {
  assert.equal(calculateSwissGrade(-10, 100), 1.0);
  assert.equal(calculateSwissGrade(120, 100), 6.0);
});

test('calculateSwissGrade handles invalid inputs safely', () => {
  assert.equal(calculateSwissGrade(50, 0), 1.0);
  assert.equal(calculateSwissGrade(NaN, 100), 1.0);
});

test('pointsNeededForGrade computes required points accurately', () => {
  // target = 4.0, max = 80 -> ((4.0 - 1) / 5) * 80 = 0.6 * 80 = 48
  assert.equal(pointsNeededForGrade(4.0, 80), 48.0);
  // target = 6.0, max = 80 -> 80
  assert.equal(pointsNeededForGrade(6.0, 80), 80.0);
});

test('neededPointsTable returns all standard target grades', () => {
  const table = neededPointsTable(100);
  assert.equal(table.length, 4);
  assert.deepEqual(table.map((t) => t.grade), [4.0, 5.0, 5.5, 6.0]);
  assert.deepEqual(table.map((t) => t.points), [60.0, 80.0, 90.0, 100.0]);
});
