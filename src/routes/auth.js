const bcrypt = require('bcryptjs');
const { newToken } = require('../migrate');
const { normalizeEmail, checkRegistrationAccess, PRIVACY_VERSION } = require('../access');
const {
  sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail, getMailStatus,
} = require('../mail');
const { PRODUCT_SHEET } = require('./downloads');
const { generateRecoveryId, normalizeRecoveryId } = require('../recovery');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 20;
const PASSWORD_HINT = `Passwort muss ${MIN_PASSWORD} bis ${MAX_PASSWORD} Zeichen lang sein.`;

module.exports = function authRoutes(app, ctx) {
  const {
    pool, config, requireAuth, asyncRoute, authLimiter, audit, chat,
  } = ctx;

  async function findParticipant(email) {
    const res = await pool.query('SELECT * FROM participants WHERE email = $1', [email]);
    return res.rows[0] || null;
  }

  function validPassword(password) {
    return typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD;
  }

  app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    const participant = await findParticipant(email);
    const access = checkRegistrationAccess(email, participant, config.domains);
    if (!access.ok) return res.status(403).json({ error: access.reason });
    if (!validPassword(password)) {
      return res.status(400).json({ error: PASSWORD_HINT });
    }
    if (req.body.consent !== true) {
      return res.status(400).json({ error: 'Bitte bestätige die Datenschutzerklärung.' });
    }

    const displayName = String(req.body.display_name || participant.full_name).trim().slice(0, 100)
      || participant.full_name;
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const token = newToken();

    const existing = await pool.query('SELECT id, email_verified FROM users WHERE email = $1', [email]);
    if (existing.rows[0] && existing.rows[0].email_verified) {
      return res.status(409).json({ error: 'Für diese Adresse gibt es bereits ein Konto. Bitte anmelden.' });
    }
    if (existing.rows[0]) {
      // Noch nicht bestätigt: Passwort und Link erneuern
      await pool.query(
        `UPDATE users SET password_hash = $2, display_name = $3, verify_token = $4, role = $5,
                consent_at = NOW(), consent_version = $6 WHERE id = $1`,
        [existing.rows[0].id, hash, displayName, token, access.role, PRIVACY_VERSION]
      );
    } else {
      await pool.query(
        `INSERT INTO users (email, display_name, password_hash, email_verified, verify_token, role, calendar_token,
                            consent_at, consent_version)
         VALUES ($1, $2, $3, false, $4, $5, $6, NOW(), $7)`,
        [email, displayName, hash, token, access.role, newToken(16), PRIVACY_VERSION]
      );
    }
    await audit(req, 'register', email, { consentVersion: PRIVACY_VERSION }, { id: null, email });

    const mail = await sendVerificationEmail({
      email, name: displayName, token, req,
    });
    const smtp = getMailStatus().configured;
    return res.status(201).json({
      success: true,
      mailSent: mail.sent,
      message: mail.sent
        ? `Fast geschafft! Wir haben dir einen Bestätigungslink an ${email} geschickt.`
        : smtp
          ? 'Konto erstellt, aber die Bestätigungs-Mail konnte nicht versendet werden. Die Klassen-Admins können dich manuell freischalten.'
          : 'Konto erstellt. Der Mailversand ist noch nicht eingerichtet: Die Klassen-Admins schalten dich frei.',
    });
  }));

  app.get('/api/auth/verify', asyncRoute(async (req, res) => {
    const token = String(req.query.token || '');
    if (!token) return res.redirect('/#/anmelden?status=link-ungueltig');
    const result = await pool.query(
      'UPDATE users SET email_verified = true, verify_token = NULL WHERE verify_token = $1 RETURNING id, email, display_name',
      [token]
    );
    if (result.rows.length === 0) return res.redirect('/#/anmelden?status=link-ungueltig');
    const verified = result.rows[0];
    await audit(req, 'email_verified', null, null, { id: verified.id, email: verified.email });
    sendWelcomeEmail({
      email: verified.email, name: verified.display_name, req, attachmentPath: PRODUCT_SHEET,
    }).catch(() => {});
    res.cookie(config.sessionCookie, result.rows[0].id, config.cookieOpts);
    return res.redirect('/#/dashboard?willkommen=1');
  }));

  app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    const ok = user && typeof password === 'string' && await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await audit(req, 'login_failed', email.slice(0, 255));
      return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
    }

    const participant = await findParticipant(email);
    if (!participant || !participant.active) {
      return res.status(403).json({ error: 'Diese Adresse steht nicht (mehr) auf der Teilnehmerliste.' });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: getMailStatus().configured
          ? 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem HKV-Postfach).'
          : 'Dein Konto wartet noch auf die Freischaltung durch den Admin.',
      });
    }
    // Nach einem Admin-Reset: Werkspasswort allein reicht nicht, die persönliche ID muss stimmen
    if (user.must_change_password && user.recovery_hash) {
      const given = normalizeRecoveryId(req.body.recovery_id);
      if (!given) {
        return res.status(428).json({ needRecovery: true, error: 'Dein Passwort wurde zurückgesetzt. Bitte zusätzlich deine persönliche Wiederherstellungs-ID eingeben.' });
      }
      if (!await bcrypt.compare(given, user.recovery_hash)) {
        await audit(req, 'recovery_id_failed', email);
        return res.status(401).json({ needRecovery: true, error: 'Die Wiederherstellungs-ID stimmt nicht.' });
      }
    }
    if (user.role !== participant.role) {
      await pool.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, participant.role]);
    }
    res.cookie(config.sessionCookie, user.id, config.cookieOpts);
    await audit(req, 'login', null, null, user);
    return res.json({ success: true });
  }));

  app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    if (req.user) {
      chat.leaveAll(req.user.id);
      await audit(req, 'logout');
    }
    res.clearCookie(config.sessionCookie);
    res.json({ success: true });
  }));

  app.post('/api/auth/forgot', authLimiter, asyncRoute(async (req, res) => {
    if (!getMailStatus().configured) {
      return res.status(400).json({ error: 'Demo-Modus ohne Mailversand: Bitte den Admin bitten, dein Passwort zurückzusetzen.' });
    }
    const email = normalizeEmail(req.body.email);
    const result = await pool.query(
      `SELECT u.id, u.display_name FROM users u
       JOIN participants p ON p.email = u.email AND p.active
       WHERE u.email = $1`,
      [email]
    );
    if (result.rows[0]) {
      const token = newToken();
      await pool.query(
        "UPDATE users SET reset_token = $2, reset_expires = NOW() + INTERVAL '1 hour' WHERE id = $1",
        [result.rows[0].id, token]
      );
      await audit(req, 'password_reset_requested', email, null, { id: result.rows[0].id, email });
      await sendPasswordResetEmail({
        email, name: result.rows[0].display_name, token, req,
      });
    }
    // Immer gleiche Antwort, damit niemand Adressen ausprobieren kann
    res.json({ success: true, message: 'Falls ein Konto existiert, ist ein Link unterwegs.' });
  }));

  app.post('/api/auth/reset', authLimiter, asyncRoute(async (req, res) => {
    const { token, password } = req.body;
    if (!validPassword(password)) {
      return res.status(400).json({ error: PASSWORD_HINT });
    }
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const result = await pool.query(
      `UPDATE users SET password_hash = $2, reset_token = NULL, reset_expires = NULL, email_verified = true
       WHERE reset_token = $1 AND reset_expires > NOW() RETURNING id`,
      [String(token || ''), hash]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Der Link ist ungültig oder abgelaufen.' });
    await audit(req, 'password_reset', null, null, { id: result.rows[0].id, email: null });
    res.cookie(config.sessionCookie, result.rows[0].id, config.cookieOpts);
    return res.json({ success: true });
  }));

  app.get('/api/me', (req, res) => {
    res.json({ user: req.user });
  });

  app.patch('/api/me', requireAuth, asyncRoute(async (req, res) => {
    const { display_name: displayName, current_password: currentPassword, new_password: newPassword } = req.body;
    if (displayName !== undefined) {
      const name = String(displayName).trim().slice(0, 100);
      if (!name) return res.status(400).json({ error: 'Name darf nicht leer sein.' });
      await pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [req.user.id, name]);
    }
    if (newPassword !== undefined) {
      if (!validPassword(newPassword)) {
        return res.status(400).json({ error: PASSWORD_HINT });
      }
      const row = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!await bcrypt.compare(String(currentPassword || ''), row.rows[0].password_hash)) {
        return res.status(400).json({ error: 'Aktuelles Passwort ist falsch.' });
      }
      if (newPassword === config.resetPassword) {
        return res.status(400).json({ error: 'Bitte ein eigenes Passwort wählen, nicht das Werkspasswort.' });
      }
      await pool.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [
        req.user.id, await bcrypt.hash(newPassword, config.bcryptRounds),
      ]);
      await audit(req, 'password_changed');
    }
    if (displayName !== undefined) await audit(req, 'profile_updated');
    res.json({ success: true });
  }));

  // Neue persönliche Wiederherstellungs-ID: wird genau einmal im Klartext angezeigt
  app.post('/api/me/recovery-id', requireAuth, asyncRoute(async (req, res) => {
    const id = generateRecoveryId();
    await pool.query('UPDATE users SET recovery_hash = $2 WHERE id = $1', [
      req.user.id, await bcrypt.hash(normalizeRecoveryId(id), config.bcryptRounds),
    ]);
    await audit(req, 'recovery_id_created');
    res.json({ recovery_id: id });
  }));

  app.post('/api/me/calendar-token', requireAuth, asyncRoute(async (req, res) => {
    const token = newToken(16);
    await pool.query('UPDATE users SET calendar_token = $2 WHERE id = $1', [req.user.id, token]);
    res.json({ calendar_token: token });
  }));

  // Zustimmung zur (aktualisierten) Datenschutzerklärung
  app.post('/api/me/consent', requireAuth, asyncRoute(async (req, res) => {
    if (req.body.consent !== true) return res.status(400).json({ error: 'Zustimmung fehlt.' });
    await pool.query('UPDATE users SET consent_at = NOW(), consent_version = $2 WHERE id = $1', [req.user.id, PRIVACY_VERSION]);
    await audit(req, 'consent', null, { consentVersion: PRIVACY_VERSION });
    res.json({ success: true });
  }));

  // Auskunftsrecht (Art. 25 DSG): alle eigenen Daten als JSON
  app.get('/api/me/export', requireAuth, asyncRoute(async (req, res) => {
    const id = req.user.id;
    const [account, submissions, threads, posts, likes, activity, log, attendance] = await Promise.all([
      pool.query(`SELECT email, display_name, role, email_verified, created_at, consent_at, consent_version
                  FROM users WHERE id = $1`, [id]),
      pool.query(`SELECT t.title, t.module_code, t.kind, s.points, COALESCE(t.max_points, s.max_points) AS max_points,
                         s.note, s.submitted_at, s.updated_at
                  FROM submissions s JOIN tasks t ON t.id = s.task_id WHERE s.user_id = $1 ORDER BY s.submitted_at`, [id]),
      pool.query('SELECT title, category, body, created_at FROM forum_threads WHERE user_id = $1', [id]),
      pool.query('SELECT thread_id, body, created_at FROM forum_posts WHERE user_id = $1', [id]),
      pool.query('SELECT thread_id FROM forum_likes WHERE user_id = $1', [id]),
      pool.query("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM user_activity WHERE user_id = $1 ORDER BY day", [id]),
      pool.query('SELECT at, action, target FROM audit_log WHERE actor_id = $1 ORDER BY at', [id]),
      pool.query(`SELECT to_char(l.date, 'YYYY-MM-DD') AS date, l.module_code, l.lektionen, a.checked_at
                  FROM attendance a JOIN lessons l ON l.id = a.lesson_id WHERE a.user_id = $1 ORDER BY l.date`, [id]),
    ]);
    await audit(req, 'data_export');
    res.setHeader('Content-Disposition', 'attachment; filename="hub-042-meine-daten.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      account: account.rows[0],
      submissions: submissions.rows,
      forumThreads: threads.rows,
      forumPosts: posts.rows,
      forumLikes: likes.rows,
      activityDays: activity.rows.map((r) => r.day),
      attendance: attendance.rows,
      auditLog: log.rows,
    });
  }));

  // Konto und alle eigenen Daten löschen (DSG: Recht auf Löschung)
  app.delete('/api/me', requireAuth, asyncRoute(async (req, res) => {
    await audit(req, 'account_deleted', req.user.email);
    chat.leaveAll(req.user.id);
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.clearCookie(config.sessionCookie);
    res.json({ success: true });
  }));
};
