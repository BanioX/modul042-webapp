const test = require('node:test');
const assert = require('node:assert/strict');
const { EphemeralChat, GROUP, SESSION_TIMEOUT_MS } = require('../src/chat');

function setup() {
  let t = 0;
  const chat = new EphemeralChat({ now: () => t });
  return { chat, tick: (ms) => { t += ms; } };
}

test('Alle Eingeloggten sind im Gruppenchat', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  chat.touch(2, 'Max');
  chat.send(1, GROUP, 'Hoi zäme');
  const view = chat.view(2);
  assert.equal(view.rooms.find((r) => r.id === GROUP).messages[0].text, 'Hoi zäme');
  assert.equal(view.online.length, 2);
});

test('Nach dem Abmelden ist der alte Verlauf weg, ohne Einladung', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  chat.touch(2, 'Max');
  chat.send(1, GROUP, 'alt');
  chat.leaveAll(2);
  chat.touch(2, 'Max');
  const room = chat.view(2).rooms.find((r) => r.id === GROUP);
  assert.equal(room.messages.length, 0);
  chat.send(1, GROUP, 'neu');
  assert.deepEqual(chat.view(2).rooms.find((r) => r.id === GROUP).messages.map((m) => m.text), ['neu']);
});

test('Einladung gibt den bisherigen Verlauf wieder frei', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  chat.touch(2, 'Max');
  chat.send(1, GROUP, 'alt');
  chat.leaveAll(2);
  chat.touch(2, 'Max');
  chat.invite(1, 2, GROUP);
  assert.deepEqual(chat.view(2).rooms.find((r) => r.id === GROUP).messages.map((m) => m.text), ['alt']);
});

test('Sind alle draussen, wird der Verlauf gelöscht', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  chat.send(1, GROUP, 'geheim');
  chat.leaveAll(1);
  assert.equal(chat.rooms.size, 0);
  chat.touch(1, 'Alban');
  assert.equal(chat.view(1).rooms.find((r) => r.id === GROUP).messages.length, 0);
});

test('Direktnachrichten sehen nur die zwei Beteiligten', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  chat.touch(2, 'Max');
  chat.touch(3, 'Erika');
  const dm = EphemeralChat.dmId(2, 1);
  chat.join(1, dm);
  chat.send(1, dm, 'nur für Max');
  assert.equal(chat.view(2).rooms.find((r) => r.id === dm).messages[0].text, 'nur für Max');
  assert.equal(chat.view(3).rooms.find((r) => r.id === dm), undefined);
  assert.throws(() => chat.join(3, dm), /Kein Zugriff/);
  assert.throws(() => chat.invite(1, 3, dm), /gehört nicht/);
});

test('Wer 5 Minuten nicht mehr da ist, verlässt alle Chats', () => {
  const { chat, tick } = setup();
  chat.touch(1, 'Alban');
  chat.touch(2, 'Max');
  chat.send(2, GROUP, 'bis gleich');
  tick(SESSION_TIMEOUT_MS + 1000);
  chat.touch(1, 'Alban');
  assert.equal(chat.isOnline(2), false);
  assert.equal(chat.view(1).rooms.find((r) => r.id === GROUP).members.length, 1);
});

test('Nur Mitglieder dürfen schreiben und einladen', () => {
  const { chat } = setup();
  chat.touch(1, 'Alban');
  assert.throws(() => chat.send(9, GROUP, 'x'), /nicht in diesem Chat/);
  assert.throws(() => chat.invite(9, 1, GROUP), /nicht in diesem Chat/);
  assert.throws(() => chat.send(1, GROUP, '   '), /leer/);
});
