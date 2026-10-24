const bcrypt = require('bcryptjs');
const { publicUrl, qrSvg } = require('../publicurl');
const {
  normalizeEmail, isValidEmail, isAllowedDomain, parseParticipantLines,
} = require('../access');
const {
  sendInvitationEmail, sendWelcomeEmail, sendTestEmail, getMailStatus,
} = require('../mail');
const { PRODUCT_SHEET } = require('./downloads');

const ROLES = ['student', 'dozent', 'admin'];

module.exports = function adminRoutes(app, ctx) {
  const {
    pool, config, requireAuth, requireManager, requireAdmin, asyncRoute, audit,
  } = ctx;
  const guard = [requireAuth, requireManager];
  // Leute aufnehmen, freischalten, sperren und Passwörter zurücksetzen: nur Admin
  const adminOnly = [requireAuth, requireAdmin];

  function roleAllowed(req, role) {
    // Nur Admins dürfen andere zu Admins machen
    return ROLES.includes(role) && (role !== 'admin' || req.user.role === 'admin');
  }

  app.get('/api/admin/participants', ...adminOnly, asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT p.email, p.full_name, p.role, p.active, p.added_at,
              u.id AS user_id, u.email_verified, u.created_at AS registered_at,
              (SELECT MAX(day) FROM user_activity a WHERE a.user_id = u.id) AS last_active
       FROM participants p LEFT JOIN users u ON u.email = p.email
       ORDER BY p.active DESC, p.role DESC, p.full_name`
    );
    res.json({
      participants: result.rows,
      mail: getMailStatus(),
      resetConfigured: Boolean(config.resetPassword),
      isAdmin: req.user.role === 'admin',
      domains: config.domains,
      configured: { admins: config.admins, dozenten: config.dozenten },
    });
  }));

  app.post('/api/admin/participants', ...adminOnly, asyncRoute(async (req, res) => {
    const role = req.body.role || 'student';
    if (!roleAllowed(req, role)) return res.status(403).json({ error: 'Diese Rolle darfst du nicht vergeben.' });
    const { rows, errors } = parseParticipantLines(req.body.text);
    let added = 0;
    for (const row of rows) {
      if (!isValidEmail(row.email) || !isAllowedDomain(row.email, config.domains)) {
        errors.push(`${row.email}: keine erlaubte HKV-Adresse`);
        continue;
      }
      const result = await pool.query(
        `INSERT INTO participants (email, full_name, role) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET active = true RETURNING (xmax = 0) AS inserted`,
        [row.email, row.full_name.slice(0, 150), role]
      );
      if (result.rows[0].inserted) added += 1;
    }
    await audit(req, 'participants_added', null, { count: added, role });
    res.json({ added, errors });
  }));

  app.patch('/api/admin/participants/:email', ...adminOnly, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.params.email);
    if ([...config.admins, ...config.dozenten].includes(email)) {
      return res.status(400).json({ error: 'Diese Adresse ist fest in der Konfiguration (.env) hinterlegt.' });
    }
    const { role, active, full_name: fullName } = req.body;
    if (role !== undefined) {
      if (!roleAllowed(req, role)) return res.status(403).json({ error: 'Diese Rolle darfst du nicht vergeben.' });
      await pool.query('UPDATE participants SET role = $2 WHERE email = $1', [email, role]);
      await pool.query('UPDATE users SET role = $2 WHERE email = $1', [email, role]);
    }
    if (typeof active === 'boolean') {
      await pool.query('UPDATE participants SET active = $2 WHERE email = $1', [email, active]);
      if (!active) {
        const u = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (u.rows[0]) ctx.chat.leaveAll(u.rows[0].id);
      }
    }
    if (fullName) {
      await pool.query('UPDATE participants SET full_name = $2 WHERE email = $1', [email, String(fullName).slice(0, 150)]);
    }
    await audit(req, 'participant_updated', email, { role, active });
    res.json({ success: true });
  }));

  app.delete('/api/admin/participants/:email', ...adminOnly, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.params.email);
    if ([...config.admins, ...config.dozenten].includes(email)) {
      return res.status(400).json({ error: 'Diese Adresse ist fest in der Konfiguration (.env) hinterlegt.' });
    }
    // Konto bleibt bestehen, kommt aber ohne Eintrag auf der Liste nicht mehr rein
    await pool.query('DELETE FROM participants WHERE email = $1', [email]);
    await audit(req, 'participant_removed', email);
    res.json({ success: true });
  }));

  app.post('/api/admin/participants/:email/invite', ...adminOnly, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.params.email);
    const p = await pool.query('SELECT * FROM participants WHERE email = $1 AND active', [email]);
    if (!p.rows[0]) return res.status(404).json({ error: 'Nicht auf der Teilnehmerliste.' });
    const result = await sendInvitationEmail({
      email, name: p.rows[0].full_name, inviter: req.user.display_name, req,
    });
    await audit(req, 'invitation_sent', email, { sent: result.sent });
    if (!result.sent) {
      return res.status(502).json({
        error: result.mode === 'dev-fallback'
          ? 'SMTP ist noch nicht eingerichtet (.env). Der Link steht im Server-Log.'
          : `Versand fehlgeschlagen: ${result.error}`,
      });
    }
    res.json({ success: true });
  }));

  // Passwort auf das Werkspasswort (RESET_PASSWORD in .env) zurücksetzen; beim nächsten Login Pflichtwechsel
  app.post('/api/admin/users/:id/reset-password', ...adminOnly, asyncRoute(async (req, res) => {
    if (!config.resetPassword || config.resetPassword.length < 8 || config.resetPassword.length > 20) {
      return res.status(400).json({ error: 'RESET_PASSWORD (8–20 Zeichen) ist in der .env nicht gesetzt.' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Das eigene Passwort bitte im Profil ändern.' });
    }
    const hash = await bcrypt.hash(config.resetPassword, config.bcryptRounds);
    // withId: auch die Wiederherstellungs-ID löschen (wenn die Person sie verloren hat).
    // Dann reicht einmalig das Werkspasswort, und beim Login wird eine neue ID erzeugt.
    const withId = req.body && req.body.withId === true;
    const result = await pool.query(
      `UPDATE users SET password_hash = $2, must_change_password = true, email_verified = true,
              reset_token = NULL, verify_token = NULL${withId ? ', recovery_hash = NULL' : ''}
       WHERE id = $1 RETURNING email`,
      [req.params.id, hash]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Konto nicht gefunden.' });
    await audit(req, withId ? 'password_and_id_reset_by_admin' : 'password_reset_by_admin', result.rows[0].email);
    res.json({
      success: true,
      message: withId
        ? `Passwort und Wiederherstellungs-ID von ${result.rows[0].email} zurückgesetzt. Login jetzt nur mit Werkspasswort, danach neue ID.`
        : `Passwort von ${result.rows[0].email} zurückgesetzt. Login mit Werkspasswort und persönlicher ID.`,
    });
  }));

  // Aktuelle öffentliche Adresse + QR-Code (zum Weitergeben an die Klasse)
  app.get('/api/admin/public-url', ...adminOnly, asyncRoute(async (req, res) => {
    const info = await publicUrl();
    // Der QR-Code führt direkt zum Onboarding (3 Schritte bis zum Konto)
    const shareUrl = info.url ? `${info.url}/#/willkommen` : null;
    res.json({ ...info, shareUrl, qr: shareUrl ? await qrSvg(shareUrl) : null });
  }));

  // Test-Mail an sich selbst, um die SMTP-Einstellungen zu prüfen
  app.post('/api/admin/mail-test', ...adminOnly, asyncRoute(async (req, res) => {
    const result = await sendTestEmail({ email: req.user.email, name: req.user.display_name, req });
    await audit(req, 'mail_test', null, { sent: result.sent });
    if (result.sent) return res.json({ success: true, message: `Test-Mail an ${req.user.email} versendet.` });
    return res.status(502).json({
      error: result.mode === 'dev-fallback'
        ? 'SMTP ist nicht eingerichtet (SMTP_HOST, SMTP_USER, SMTP_PASS in der .env).'
        : `Versand fehlgeschlagen: ${result.error}`,
    });
  }));

  // Manuell freischalten, falls die Bestätigungs-Mail nicht ankommt
  app.post('/api/admin/users/:id/verify', ...adminOnly, asyncRoute(async (req, res) => {
    const result = await pool.query(
      'UPDATE users SET email_verified = true, verify_token = NULL WHERE id = $1 RETURNING email, display_name',
      [req.params.id]
    );
    await audit(req, 'user_verified_manually', `user:${req.params.id}`);
    if (result.rows[0]) {
      sendWelcomeEmail({
        email: result.rows[0].email, name: result.rows[0].display_name, req, attachmentPath: PRODUCT_SHEET,
      }).catch(() => {});
    }
    res.json({ success: true });
  }));

  // Audit-Protokoll (nur Admins): Anmeldungen, Zustimmungen, Verwaltungsaktionen
  app.get('/api/admin/audit', requireAuth, asyncRoute(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins.' });
    const result = await pool.query(
      `SELECT at, actor_email, action, target, details FROM audit_log ORDER BY at DESC LIMIT 300`
    );
    const consent = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE consent_version IS NOT NULL)::int AS with_consent,
              COUNT(*)::int AS total FROM users WHERE email_verified`
    );
    res.json({ entries: result.rows, consent: consent.rows[0] });
  }));

  app.post('/api/admin/years', ...guard, asyncRoute(async (req, res) => {
    const { label, klasse, start_date: start, end_date: end } = req.body;
    if (!label || !start || !end) return res.status(400).json({ error: 'Bezeichnung, Start und Ende sind nötig.' });
    await pool.query(
      'INSERT INTO school_years (label, klasse, start_date, end_date) VALUES ($1, $2, $3, $4)',
      [String(label).slice(0, 100), String(klasse || 'HFWI-2504-AA').slice(0, 50), start, end]
    );
    res.status(201).json({ success: true });
  }));

  app.put('/api/admin/years/:id', ...guard, asyncRoute(async (req, res) => {
    const { label, klasse, start_date: start, end_date: end } = req.body;
    await pool.query(
      'UPDATE school_years SET label = $2, klasse = $3, start_date = $4, end_date = $5 WHERE id = $1',
      [req.params.id, String(label).slice(0, 100), String(klasse).slice(0, 50), start, end]
    );
    res.json({ success: true });
  }));

  app.put('/api/admin/modules/:code', ...guard, asyncRoute(async (req, res) => {
    const code = String(req.params.code).trim().slice(0, 16);
    const {
      name, lektionen, school_year_id: yearId, color, dozent,
    } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Kürzel und Name sind nötig.' });
    await pool.query(
      `INSERT INTO modules (code, name, lektionen, catalog, school_year_id, color, dozent)
       VALUES ($1, $2, $3, true, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, lektionen = EXCLUDED.lektionen,
         school_year_id = EXCLUDED.school_year_id, color = EXCLUDED.color, dozent = EXCLUDED.dozent`,
      [code, String(name).slice(0, 255), parseInt(lektionen, 10) || 0, yearId || null,
        /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2f7d5b', dozent ? String(dozent).slice(0, 150) : null]
    );
    res.json({ success: true });
  }));
};
