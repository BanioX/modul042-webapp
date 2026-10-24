// Notfall-Reset ohne Weboberfläche (z. B. wenn der Admin sein Passwort vergessen hat):
//   docker compose exec app node src/cli/reset-password.js vorname.nachname@stud.hkv.ch
// Setzt Passwort auf RESET_PASSWORD, schaltet das Konto frei und löscht die Wiederherstellungs-ID.
// Beim nächsten Login: Werkspasswort eingeben, neue ID notieren, eigenes Passwort wählen.
const bcrypt = require('bcryptjs');
const { createPool } = require('../db');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const password = process.env.RESET_PASSWORD || '';
  if (!email) throw new Error('Mailadresse fehlt: node src/cli/reset-password.js vorname.nachname@stud.hkv.ch');
  if (password.length < 8 || password.length > 20) throw new Error('RESET_PASSWORD (8–20 Zeichen) ist in der .env nicht gesetzt.');
  const pool = createPool();
  const result = await pool.query(
    `UPDATE users SET password_hash = $2, must_change_password = true, email_verified = true,
            recovery_hash = NULL, verify_token = NULL, reset_token = NULL
     WHERE email = $1 RETURNING email`,
    [email, await bcrypt.hash(password, 10)]
  );
  await pool.query(
    "INSERT INTO audit_log (actor_email, action, target) VALUES ('cli', 'password_and_id_reset_by_cli', $1)",
    [email]
  );
  await pool.end();
  console.log(result.rows[0]
    ? `OK: ${email} kann sich jetzt mit dem Werkspasswort anmelden und muss danach ein neues Passwort wählen.`
    : `Kein Konto mit ${email} gefunden. Zuerst auf der Website registrieren.`);
})().catch((err) => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
