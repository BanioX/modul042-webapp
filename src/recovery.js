/** Persönliche Wiederherstellungs-ID: nur die Person kennt sie, gespeichert wird nur ein bcrypt-Hash. */
const crypto = require('crypto');

// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRecoveryId() {
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function normalizeRecoveryId(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

module.exports = { generateRecoveryId, normalizeRecoveryId, ALPHABET };
