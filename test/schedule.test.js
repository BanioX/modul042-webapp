const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLessonLines, parseDate } = require('../src/routes/schedule');
const { buildCalendar } = require('../src/ics');
const { lessonsFor, modulesFor } = require('../src/catalog');

test('Datum im Schweizer Format', () => {
  assert.equal(parseDate('26.08.2026'), '2026-08-26');
  assert.equal(parseDate('2026-08-26'), '2026-08-26');
  assert.equal(parseDate('1.9.2026'), '2026-09-01');
  assert.equal(parseDate('morgen'), null);
});

test('Excel-Zeilen (Tab-getrennt) importieren', () => {
  const { rows, errors } = parseLessonLines('Datum\tBeginn\tEnde\n26.08.2026\t13:00\t16:10\t4\tAPPL\tDozent*in\t\nquatsch');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    date: '2026-08-26', start: '13:00', end: '16:10', lektionen: 4, module: 'APPL', dozent: 'Dozent*in', note: null,
  });
  assert.equal(errors.length, 1);
});

test('Stundenpläne beider Studienjahre sind hinterlegt', () => {
  assert.ok(lessonsFor('1').length > 100);
  assert.ok(lessonsFor('2').length > 80);
  const appl = modulesFor('2').find((m) => m.code === 'APPL');
  assert.equal(appl.lektionen, 32);
  assert.equal(lessonsFor('2').filter((l) => l.module === 'APPL').length, 8);
  // Keine Namen von Dozierenden im öffentlichen Repo
  assert.ok([...lessonsFor('1'), ...lessonsFor('2')].every((l) => l.dozent === null));
});

test('iCalendar-Export', () => {
  const ics = buildCalendar('Test', [
    { uid: 'a@x', summary: 'APPL, Modul 042', date: '2026-10-21', start: '13:00', end: '16:10', location: 'Zimmer 126' },
    { uid: 'b@x', summary: 'ATL', dueAt: '2027-01-10T22:59:00Z' },
    { uid: 'c@x', summary: 'Jahresprüfung', date: '2027-03-03' },
  ], new Date('2026-10-24T00:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;TZID=Europe/Zurich:20261021T130000'));
  assert.ok(ics.includes('SUMMARY:APPL\\, Modul 042'));
  assert.ok(ics.includes('DTSTART:20270110T225900Z'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270304'));
});
