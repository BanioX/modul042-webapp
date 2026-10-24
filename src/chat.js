/**
 * Flüchtiger Chat: lebt ausschliesslich im Arbeitsspeicher, nie in der Datenbank.
 *
 * Regeln:
 * - Raum "klasse" für alle, Direktnachrichten "dm:<id>-<id>" für zwei Personen.
 * - Wer sich abmeldet oder SESSION_TIMEOUT lang nicht mehr da ist, verlässt alle Räume
 *   und sieht danach den alten Verlauf nicht mehr.
 * - Wer noch im Raum ist, kann jemanden wieder einladen: dann ist der bisherige Verlauf
 *   wieder sichtbar.
 * - Ist niemand mehr in einem Raum, wird sein Verlauf sofort gelöscht.
 */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_MESSAGES = 500;
const MAX_LENGTH = 1000;
const GROUP = 'klasse';

class EphemeralChat {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.rooms = new Map(); // id → { id, type, allowed: Set|null, members: Map(userId → visibleFrom), invites: Set, messages: [] }
    this.presence = new Map(); // userId → { name, lastSeen }
    this.seq = 0;
  }

  static dmId(a, b) {
    const [x, y] = [Number(a), Number(b)].sort((p, q) => p - q);
    return `dm:${x}-${y}`;
  }

  room(id) {
    if (!this.rooms.has(id)) {
      let allowed = null;
      if (id.startsWith('dm:')) allowed = new Set(id.slice(3).split('-').map(Number));
      this.rooms.set(id, {
        id, type: allowed ? 'dm' : 'group', allowed, members: new Map(), invites: new Set(), messages: [],
      });
    }
    return this.rooms.get(id);
  }

  /** Lebenszeichen; räumt dabei abgelaufene Sitzungen auf. */
  touch(userId, name) {
    this.expire();
    const isNew = !this.presence.has(userId);
    this.presence.set(userId, { name, lastSeen: this.now() });
    if (isNew) this.join(userId, GROUP);
  }

  isOnline(userId) {
    return this.presence.has(userId);
  }

  /** Raum betreten. Ohne Einladung sieht man nur Nachrichten ab jetzt. */
  join(userId, roomId) {
    const room = this.room(roomId);
    if (room.allowed && !room.allowed.has(Number(userId))) throw new Error('Kein Zugriff auf diesen Chat.');
    if (room.members.has(userId)) return room;
    const invited = room.invites.delete(userId);
    room.members.set(userId, invited ? 0 : this.seq + 1);
    return room;
  }

  /** Einladung durch jemanden, der im Raum ist: gibt den bisherigen Verlauf frei. */
  invite(byUserId, targetId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(byUserId)) throw new Error('Du bist nicht in diesem Chat.');
    if (room.allowed && !room.allowed.has(Number(targetId))) throw new Error('Diese Person gehört nicht zu diesem Chat.');
    if (room.members.has(targetId)) room.members.set(targetId, 0);
    else room.invites.add(targetId);
  }

  send(userId, roomId, text) {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(userId)) throw new Error('Du bist nicht in diesem Chat.');
    const body = String(text || '').trim().slice(0, MAX_LENGTH);
    if (!body) throw new Error('Nachricht ist leer.');
    // Direktnachricht: die andere Person "landet" automatisch im Raum (ohne alten Verlauf)
    if (room.allowed) {
      for (const id of room.allowed) {
        if (id !== userId && this.isOnline(id) && !room.members.has(id)) this.join(id, roomId);
      }
    }
    this.seq += 1;
    const msg = {
      id: this.seq, room: roomId, userId, name: this.presence.get(userId)?.name || '?', text: body, at: new Date(this.now()).toISOString(),
    };
    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGES) room.messages.shift();
    return msg;
  }

  /** Alles, was eine Person sehen darf. */
  view(userId) {
    const rooms = [];
    for (const room of this.rooms.values()) {
      if (!room.members.has(userId) && !room.invites.has(userId)) continue;
      const visibleFrom = room.members.get(userId);
      const member = visibleFrom !== undefined;
      rooms.push({
        id: room.id,
        type: room.type,
        member,
        invited: !member && room.invites.has(userId),
        partner: room.allowed ? [...room.allowed].find((id) => id !== userId) : null,
        members: [...room.members.keys()].map((id) => ({ id, name: this.presence.get(id)?.name || '?' })),
        messages: member ? room.messages.filter((m) => m.id >= visibleFrom) : [],
      });
    }
    const online = [...this.presence.entries()].map(([id, p]) => ({ id, name: p.name }));
    return { rooms, online };
  }

  /** Abmelden: alle Räume verlassen, leere Räume samt Verlauf löschen. */
  leaveAll(userId) {
    this.presence.delete(userId);
    for (const room of [...this.rooms.values()]) {
      room.members.delete(userId);
      room.invites.delete(userId);
      if (room.members.size === 0) this.rooms.delete(room.id);
    }
  }

  expire() {
    const limit = this.now() - SESSION_TIMEOUT_MS;
    for (const [id, p] of [...this.presence.entries()]) {
      if (p.lastSeen < limit) this.leaveAll(id);
    }
  }
}

module.exports = {
  EphemeralChat, GROUP, SESSION_TIMEOUT_MS, MAX_LENGTH,
};
