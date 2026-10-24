const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkRegistrationAccess, isAllowedDomain, parseList, parseParticipantLines, nameFromEmail, canManage,
} = require('../src/access');

const participant = { email: 'max.muster@stud.hkv.ch', role: 'student', active: true };

test('nur HKV-Domains sind erlaubt', () => {
  assert.equal(isAllowedDomain('erika.beispiel@stud.hkv.ch'), true);
  assert.equal(isAllowedDomain('vorname.nachname@hkv.ch'), true);
  assert.equal(isAllowedDomain('ERIKA.BEISPIEL@STUD.HKV.CH'), true);
  assert.equal(isAllowedDomain('erika.beispiel@gmail.com'), false);
  assert.equal(isAllowedDomain('x@stud.hkv.ch.evil.com'), false);
  assert.equal(isAllowedDomain('x@evilhkv.ch'), false);
});

test('Registrierung verlangt Domain UND Eintrag auf der Teilnehmerliste', () => {
  assert.equal(checkRegistrationAccess('max.muster@stud.hkv.ch', participant).ok, true);
  assert.equal(checkRegistrationAccess('fremd@stud.hkv.ch', null).ok, false);
  assert.equal(checkRegistrationAccess('max.muster@gmail.com', participant).ok, false);
  assert.equal(checkRegistrationAccess('max.muster@stud.hkv.ch', { ...participant, active: false }).ok, false);
  assert.equal(checkRegistrationAccess('kein-mail', null).ok, false);
});

test('Rolle kommt aus der Teilnehmerliste', () => {
  const res = checkRegistrationAccess('vorname.nachname@hkv.ch', { role: 'dozent', active: true });
  assert.equal(res.role, 'dozent');
});

test('Listen aus .env werden sauber geparst', () => {
  assert.deepEqual(parseList('A@stud.hkv.ch, b@stud.hkv.ch;c@hkv.ch'), ['a@stud.hkv.ch', 'b@stud.hkv.ch', 'c@hkv.ch']);
  assert.deepEqual(parseList('', ['x']), ['x']);
  assert.deepEqual(parseList(undefined, []), []);
});

test('Teilnehmerliste aus eingefügtem Text', () => {
  const { rows, errors } = parseParticipantLines('Max Muster; max.muster@stud.hkv.ch\nerika.beispiel@stud.hkv.ch\nohne mail');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].full_name, 'Max Muster');
  assert.equal(rows[1].full_name, 'Erika Beispiel');
  assert.equal(errors.length, 1);
  assert.equal(nameFromEmail('max.muster@stud.hkv.ch'), 'Max Muster');
});

test('Nur Admins und Dozierende verwalten', () => {
  assert.equal(canManage({ role: 'admin' }), true);
  assert.equal(canManage({ role: 'dozent' }), true);
  assert.equal(canManage({ role: 'student' }), false);
  assert.equal(canManage(null), false);
});
