const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createPool } = require('./db');
const { migrate } = require('./migrate');
const { getMailStatus } = require('./mail');
const {
  DEFAULT_ADMINS, DEFAULT_DOZENTEN, DEFAULT_DOMAINS, parseList, canManage,
} = require('./access');

const PORT = process.env.PORT || 3000;
const config = {
  appName: process.env.APP_NAME || 'Alban',
  version: process.env.APP_VERSION || 'dev-local',
  sessionSecret: process.env.SESSION_SECRET,
  admins: parseList(process.env.ADMIN_EMAILS, DEFAULT_ADMINS),
  dozenten: parseList(process.env.DOZENT_EMAILS, DEFAULT_DOZENTEN),
  // Teilnehmerliste steht nur in .env (nicht im öffentlichen Repo)
  students: parseList(process.env.TEILNEHMER_EMAILS, []),
  domains: parseList(process.env.ALLOWED_EMAIL_DOMAINS, DEFAULT_DOMAINS),
  bcryptRounds: 10,
  sessionCookie: 'user_session',
  cookieOpts: {
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 30 * 24 * 3600 * 1000,
  },
};

if (!config.sessionSecret) throw new Error('SESSION_SECRET fehlt');
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD fehlt');

const app = express();
const pool = createPool();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
// Nicht für Suchmaschinen: kein Indexieren, Folgen oder Archivieren
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser(config.sessionSecret));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte später erneut versuchen.' },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Kurz durchatmen und nochmals versuchen.' },
});

// -------------------------------------------------------------
// Session: Benutzer laden, Teilnehmerliste prüfen, Aktivität loggen
// -------------------------------------------------------------
async function loadUser(req, res, next) {
  req.user = null;
  const userId = req.signedCookies[config.sessionCookie];
  if (!userId) return next();
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.email_verified, u.calendar_token,
              u.consent_at, u.consent_version
       FROM users u
       JOIN participants p ON p.email = u.email AND p.active = true
       WHERE u.id = $1 AND u.email_verified = true`,
      [userId]
    );
    req.user = result.rows[0] || null;
    if (req.user) {
      pool.query(
        'INSERT INTO user_activity (user_id, day) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING',
        [req.user.id]
      ).catch(() => {});
    } else {
      res.clearCookie(config.sessionCookie);
    }
  } catch {
    req.user = null;
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bitte zuerst anmelden.' });
  return next();
}

function requireManager(req, res, next) {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Nur für Dozierende und Klassen-Admins.' });
  return next();
}

/** Schuljahr aus ?year= oder das aktuelle (heute im Zeitraum, sonst das neueste). */
async function resolveYear(req) {
  const years = await pool.query('SELECT * FROM school_years ORDER BY start_date');
  const requested = parseInt(req.query.year || (req.body && req.body.school_year_id), 10);
  const byId = years.rows.find((y) => y.id === requested);
  if (byId) return byId;
  const today = new Date().toISOString().slice(0, 10);
  return years.rows.find((y) => y.start_date <= today && today <= y.end_date)
    || years.rows[years.rows.length - 1]
    || null;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`[API] ${req.method} ${req.originalUrl}:`, err.message);
    res.status(500).json({ error: 'Serverfehler. Bitte später erneut versuchen.' });
  });
}

/** Audit-Protokoll: wer hat wann was getan (ohne Passwörter oder Punkte). */
async function audit(req, action, target = null, details = null, actor = null) {
  const who = actor || req.user || null;
  try {
    await pool.query(
      'INSERT INTO audit_log (actor_id, actor_email, action, target, details) VALUES ($1, $2, $3, $4, $5)',
      [who ? who.id : null, who ? who.email : null, action, target, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Audit-Log fehlgeschlagen:', err.message);
  }
}

const ctx = {
  pool, config, requireAuth, requireManager, resolveYear, asyncRoute, authLimiter, audit,
};

// -------------------------------------------------------------
// Healthcheck (Übung 3)
// -------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const counts = await pool.query(`
      SELECT (SELECT COUNT(*) FROM users)::int AS users,
             (SELECT COUNT(*) FROM participants WHERE active)::int AS participants,
             (SELECT COUNT(*) FROM tasks)::int AS tasks,
             (SELECT COUNT(*) FROM lessons)::int AS lessons
    `);
    const mail = getMailStatus();
    res.json({
      status: 'healthy',
      database: 'connected',
      version: config.version,
      uptimeSeconds: Math.floor(process.uptime()),
      counts: counts.rows[0],
      smtp: { configured: mail.configured, mode: mail.mode },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});

app.use(loadUser);
app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

require('./routes/auth')(app, ctx);
require('./routes/hub')(app, ctx);
require('./routes/tasks')(app, ctx);
require('./routes/schedule')(app, ctx);
require('./routes/forum')(app, ctx);
require('./routes/admin')(app, ctx);
require('./routes/assistant')(app, ctx);
require('./routes/downloads')(app, ctx);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt' }));

// -------------------------------------------------------------
// Startseite mit Pflicht-Statuszeile (Übung 1):
// "Hallo von [Name] – Besucher Nr. [aus DB] – DB: verbunden – Version: [Commit-Hash]"
// -------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function statusLine(req) {
  let visitorNr = 'N/A';
  let dbStatus = 'getrennt';
  try {
    // Bewusst ohne IP-Adresse (Datensparsamkeit, siehe DATENSCHUTZ.md)
    const result = await pool.query('INSERT INTO visits (ip_address) VALUES (NULL) RETURNING id');
    visitorNr = result.rows[0].id;
    dbStatus = 'verbunden';
  } catch (err) {
    console.error('Visit counter failed:', err.message);
  }
  return `Hallo von ${config.appName} – Besucher Nr. ${visitorNr} – DB: ${dbStatus} – Version: ${config.version}`;
}

app.get('/', async (req, res) => {
  const line = await statusLine(req);
  res.type('html').send(indexTemplate.replace('{{STATUS_LINE}}', escapeHtml(line)));
});

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

// Aufbewahrungsfristen täglich durchsetzen (nicht nur beim Neustart)
setInterval(() => {
  pool.query("DELETE FROM audit_log WHERE at < NOW() - INTERVAL '365 days'").catch(() => {});
  pool.query("DELETE FROM audit_log WHERE action = 'login_failed' AND at < NOW() - INTERVAL '30 days'").catch(() => {});
}, 24 * 3600 * 1000).unref();

async function start() {
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      await migrate(pool, { admins: config.admins, dozenten: config.dozenten, students: config.students });
      console.log('Datenbank bereit.');
      break;
    } catch (err) {
      console.error(`Datenbank noch nicht bereit (Versuch ${attempt}/15):`, err.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  app.listen(PORT, () => {
    console.log(`HUB-042 läuft auf Port ${PORT} (Version ${config.version})`);
  });
}

start();
