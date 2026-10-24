const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGroups, shuffle } = require('../public/groups');

const people = Array.from({ length: 13 }, (_, i) => `P${i + 1}`);

test('Alle Personen kommen genau einmal vor', () => {
  const groups = makeGroups(people, 3);
  const flat = groups.flat().sort();
  assert.deepEqual(flat, [...people].sort());
});

test('Rest verteilen: 13 Personen in 3er-Gruppen → 4 Gruppen (eine 4er)', () => {
  const sizes = makeGroups(people, 3, 'verteilen').map((g) => g.length).sort();
  assert.deepEqual(sizes, [3, 3, 3, 4]);
});

test('Eigene Restgruppe: 13 Personen → vier 3er + eine 1er', () => {
  const sizes = makeGroups(people, 3, 'eigene').map((g) => g.length).sort();
  assert.deepEqual(sizes, [1, 3, 3, 3, 3]);
});

test('Weniger Personen als Gruppengrösse → eine Gruppe', () => {
  assert.equal(makeGroups(['A', 'B'], 3).length, 1);
  assert.deepEqual(makeGroups([], 3), []);
});

test('Mischen verändert die Reihenfolge zufällig', () => {
  const orders = new Set(Array.from({ length: 30 }, () => shuffle(people).join(',')));
  assert.ok(orders.size > 1);
});
