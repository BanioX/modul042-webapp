/* Zufalls-Gruppengenerator (Browser und Node-Tests) */
(function (root) {
  'use strict';

  function randomInt(max) {
    const c = (root.crypto && root.crypto.getRandomValues) ? root.crypto : require('crypto').webcrypto;
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] % max;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Teilt Personen zufällig in Gruppen der Grösse `size`.
   * rest = 'verteilen': Übrige kommen einzeln in bestehende Gruppen (z. B. 3er werden zu 4ern)
   * rest = 'eigene':    Übrige bilden eine kleinere Restgruppe
   */
  function makeGroups(people, size, rest = 'verteilen') {
    const n = Math.max(1, Math.floor(size));
    const mixed = shuffle(people);
    if (mixed.length === 0) return [];
    if (mixed.length <= n) return [mixed];
    const count = Math.floor(mixed.length / n);
    const groups = Array.from({ length: count }, (_, i) => mixed.slice(i * n, (i + 1) * n));
    const leftover = mixed.slice(count * n);
    if (leftover.length === 0) return groups;
    if (rest === 'eigene') return [...groups, leftover];
    leftover.forEach((p, i) => groups[i % groups.length].push(p));
    return groups;
  }

  const api = { shuffle, makeGroups };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HubGroups = api;
}(typeof window !== 'undefined' ? window : globalThis));
