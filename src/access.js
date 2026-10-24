/** Zugangsregeln: nur HKV-Adressen, die auf der Teilnehmerliste stehen. */
/** Version der Datenschutzerklärung; bei Änderung müssen alle neu zustimmen. */
const PRIVACY_VERSION = '2026-10-24b';
const DEFAULT_DOMAINS = ['stud.hkv.ch', 'hkv.ch'];
const DEFAULT_ADMINS = ['alban.hyseni@stud.hkv.ch'];
// Dozierende nur über DOZENT_EMAILS in der .env (keine Namen im öffentlichen Repo)
const DEFAULT_DOZENTEN = [];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseList(value, fallback = []) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value)
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function isAllowedDomain(email, domains = DEFAULT_DOMAINS) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at < 1) return false;
  const domain = normalized.slice(at + 1);
  return domains.includes(domain);
}

/**
 * Prüft, ob sich jemand registrieren darf.
 * participant: Zeile aus der Teilnehmerliste (oder null).
 */
function checkRegistrationAccess(email, participant, domains = DEFAULT_DOMAINS) {
  if (!isValidEmail(email)) {
    return { ok: false, reason: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
  }
  if (!isAllowedDomain(email, domains)) {
    return { ok: false, reason: 'Registrierung nur mit deiner HKV-Adresse (z. B. vorname.nachname@stud.hkv.ch).' };
  }
  if (!participant || participant.active === false) {
    return { ok: false, reason: 'Diese Adresse steht nicht auf der Teilnehmerliste der Klasse. Melde dich bei der Klassenadministration.' };
  }
  return { ok: true, role: participant.role || 'student' };
}

/** Vorschlag für den Anzeigenamen aus vorname.nachname@... */
function nameFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Klassenliste aus der .env: Admins, Dozierende, Studierende (höchste Rolle gewinnt)
function buildRoster({ admins = [], dozenten = [], students = [] }) {
  const roster = new Map();
  for (const [role, list] of [['student', students], ['dozent', dozenten], ['admin', admins]]) {
    for (const raw of list) {
      const email = normalizeEmail(raw);
      if (email) roster.set(email, { email, name: nameFromEmail(email), role });
    }
  }
  return [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Teilnehmerliste aus eingefügtem Text: "Vorname Nachname; email" oder nur "email" pro Zeile. */
function parseParticipantLines(text) {
  const rows = [];
  const errors = [];
  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, idx) => {
      const emailMatch = line.match(/[^\s;,<>]+@[^\s;,<>]+/);
      if (!emailMatch) {
        errors.push(`Zeile ${idx + 1}: keine E-Mail gefunden`);
        return;
      }
      const email = normalizeEmail(emailMatch[0]);
      const rest = line.replace(emailMatch[0], '').replace(/[;,<>\t]+/g, ' ').trim();
      rows.push({ email, full_name: rest || nameFromEmail(email) });
    });
  return { rows, errors };
}

function canManage(user) {
  return Boolean(user && (user.role === 'admin' || user.role === 'dozent'));
}

module.exports = {
  PRIVACY_VERSION,
  DEFAULT_DOMAINS,
  DEFAULT_ADMINS,
  DEFAULT_DOZENTEN,
  normalizeEmail,
  parseList,
  isValidEmail,
  isAllowedDomain,
  checkRegistrationAccess,
  parseParticipantLines,
  nameFromEmail,
  buildRoster,
  canManage,
};
