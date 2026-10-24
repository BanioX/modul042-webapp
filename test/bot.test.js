const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGradeQuestion, parseNeededQuestion, roomHint, detectModule,
} = require('../src/bot/local');

const modules = [
  { code: 'APPL', name: 'Applications-Engineering' },
  { code: 'DSRE', name: 'Datenschutz' },
  { code: 'INWI', name: 'Informations- und Wissensmanagement' },
];

test('Notenrechner versteht „45 von 60“ und „45/60“', () => {
  assert.deepEqual(parseGradeQuestion('Wie viel ist 45 von 60?'), { points: 45, max: 60 });
  assert.deepEqual(parseGradeQuestion('note bei 27,5/35'), { points: 27.5, max: 35 });
  assert.equal(parseGradeQuestion('Wann ist APPL?'), null);
  assert.equal(parseGradeQuestion('70 von 60'), null);
});

test('Benötigte Punkte für eine Zielnote', () => {
  assert.deepEqual(parseNeededQuestion('Was brauche ich für eine 5 bei 60 Punkten?'), { grade: 5, max: 60 });
  assert.deepEqual(parseNeededQuestion('wie viele punkte brauche ich für note 4.5 von 80'), { grade: 4.5, max: 80 });
  assert.equal(parseNeededQuestion('Wie ist das Wetter?'), null);
});

test('Zimmer-Hinweis nach Zimmerplan', () => {
  assert.match(roomHint('Wo ist Zimmer 126?'), /1\. Stock, Treppe West/);
  assert.match(roomHint('raum 213'), /2\. Stock, Treppe Ost/);
  assert.match(roomHint('zimmer 224'), /Aula/);
  assert.match(roomHint('Zimmer U12'), /Untergeschoss/);
  assert.equal(roomHint('keine Zahl'), null);
});

test('Modul wird per Kürzel oder Namen erkannt', () => {
  assert.equal(detectModule('Wann ist APPL?', modules).code, 'APPL');
  assert.equal(detectModule('nächste prüfung datenschutz', modules).code, 'DSRE');
  assert.equal(detectModule('Was ist Wissensmanagement?', modules).code, 'INWI');
  assert.equal(detectModule('Wann sind Ferien?', modules), null);
});
