const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { calculateSwissGrade, GRADE_ROUNDING_STEP, neededPointsTable } = require('./grades');
const { EXAM_TYPES, HFWI_MODULES, randomAlias, isCatalogModule } = require('./catalog');
const { migrate } = require('./migrate');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_NAME = process.env.APP_NAME || 'Alban';
const APP_VERSION = process.env.APP_VERSION || 'dev-local';
const SESSION_SECRET = process.env.SESSION_SECRET;
const BCRYPT_ROUNDS = 10;
const SESSION_COOKIE = 'user_session';
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  signed: true,
  maxAge: 30 * 24 * 3600 * 1000,
};

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET fehlt');
}
if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD fehlt');
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(SESSION_SECRET));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte später erneut versuchen.' },
});

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'webapp_db',
  user: process.env.DB_USER || 'webapp_user',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  max: 15,
});

const AVATARS = ['🦊', '🐺', '🦉', '🐱', '🦄', '🐯', '🐼', '🦅', '🦁', '🐻'];
function getAnonymousHandle(userId, alias) {
  const avatar = AVATARS[userId % AVATARS.length];
  return { name: alias || `Student #${String(userId).padStart(4, '0')}`, avatar };
}

function mapExamRow(row) {
  const punkte = parseFloat(row.punkte);
  const maxPunkte = parseFloat(row.max_punkte);
  const grade = calculateSwissGrade(punkte, maxPunkte);
  return {
    id: row.id,
    user_id: row.user_id,
    module_code: row.module_code,
    module_name: row.module_name,
    typ: row.typ,
    nummer: row.nummer,
    punkte,
    max_punkte: maxPunkte,
    atl_points: punkte,
    max_points: maxPunkte,
    datum: row.datum,
    grade,
  };
}

async function initDb() {
  let attempts = 10;
  while (attempts > 0) {
    try {
      await migrate(pool, { bcryptRounds: BCRYPT_ROUNDS });
      console.log('Database initialized successfully: tables ready.');
      return;
    } catch (err) {
      console.error(`Database connection pending... (${attempts} attempts left)`, err.message);
      attempts--;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// Session helper
async function getCurrentUser(req) {
  const userId = req.signedCookies[SESSION_COOKIE];
  if (!userId) return null;
  try {
    const res = await pool.query(
      'SELECT id, email, display_name, alias, email_verified FROM users WHERE id = $1',
      [userId]
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Healthcheck Endpoint (Requirement: Exercise 3)
// -------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const examCount = await pool.query('SELECT COUNT(*) FROM exams');
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      registeredUsers: parseInt(userCount.rows[0].count, 10),
      exams: parseInt(examCount.rows[0].count, 10),
      gradeRoundingStep: GRADE_ROUNDING_STEP,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message
    });
  }
});

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.get('/api/me', async (req, res) => {
  const user = await getCurrentUser(req);
  res.json({ user });
});

app.post('/api/register', authLimiter, async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const name = display_name && display_name.trim() ? display_name.trim() : email.split('@')[0];
    let result;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        result = await pool.query(
          `INSERT INTO users (email, display_name, password_hash, alias, email_verified)
           VALUES ($1, $2, $3, $4, true) RETURNING id, email, display_name, alias`,
          [email.toLowerCase().trim(), name, hash, randomAlias()]
        );
        break;
      } catch (err) {
        if (err.code !== '23505' || !String(err.constraint || '').includes('alias')) throw err;
      }
    }
    if (!result) {
      return res.status(500).json({ error: 'Alias konnte nicht vergeben werden' });
    }
    const user = result.rows[0];
    res.cookie(SESSION_COOKIE, user.id, SESSION_COOKIE_OPTS);
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Diese E-Mail ist bereits registriert' });
    }
    res.status(500).json({ error: 'Registrierungsfehler: ' + err.message });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    res.cookie(SESSION_COOKIE, user.id, SESSION_COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name, alias: user.alias } });
  } catch (err) {
    res.status(500).json({ error: 'Loginfehler: ' + err.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', signed: true });
  res.json({ success: true });
});

// -------------------------------------------------------------
// Scoring & Leaderboard Endpoints
// -------------------------------------------------------------
app.get('/api/modules', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT code, name, lektionen, catalog FROM modules ORDER BY catalog DESC, code'
    );
    res.json({
      modules: result.rows,
      catalog: HFWI_MODULES,
      examTypes: EXAM_TYPES,
      gradeRoundingStep: GRADE_ROUNDING_STEP,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grades/needed', (req, res) => {
  const max = parseFloat(req.query.max);
  if (!max || max <= 0) {
    return res.status(400).json({ error: 'max muss grösser als 0 sein' });
  }
  res.json({ max, roundingStep: GRADE_ROUNDING_STEP, needed: neededPointsTable(max) });
});

app.get('/api/scores/my', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const result = await pool.query(
      `SELECT e.*, m.name AS module_name
       FROM exams e
       JOIN modules m ON m.code = e.module_code
       WHERE e.user_id = $1
       ORDER BY e.datum DESC, e.id DESC`,
      [user.id]
    );
    res.json({ scores: result.rows.map(mapExamRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scores', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Bitte zuerst einloggen oder registrieren.' });

  const moduleCode = String(req.body.module_code || '').trim();
  const typ = String(req.body.typ || 'ATL').trim();
  const nummer = parseInt(req.body.nummer, 10) || 1;
  const pts = parseFloat(req.body.punkte ?? req.body.atl_points);
  const max = parseFloat(req.body.max_punkte ?? req.body.max_points);
  const datum = req.body.datum || new Date().toISOString().slice(0, 10);

  if (!isCatalogModule(moduleCode)) {
    return res.status(400).json({ error: 'Bitte ein Modul aus dem HFWI-Katalog wählen.' });
  }
  if (!EXAM_TYPES.includes(typ)) {
    return res.status(400).json({ error: 'Ungültiger Prüfungstyp.' });
  }
  if (nummer < 1) {
    return res.status(400).json({ error: 'Nummer muss mindestens 1 sein.' });
  }
  if (Number.isNaN(max) || max <= 0) {
    return res.status(400).json({ error: 'Max-Punkte müssen grösser als 0 sein.' });
  }
  if (Number.isNaN(pts) || pts < 0 || pts > max) {
    return res.status(400).json({ error: `Punkte müssen zwischen 0 und ${max} liegen.` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO exams (user_id, module_code, typ, nummer, punkte, max_punkte, datum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.id, moduleCode, typ, nummer, pts, max, datum]
    );
    const named = await pool.query('SELECT name FROM modules WHERE code = $1', [moduleCode]);
    const row = { ...result.rows[0], module_name: named.rows[0].name };
    res.status(201).json({ score: mapExamRow(row) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scores/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    await pool.query('DELETE FROM exams WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anonymized Leaderboard & Benchmark
app.get('/api/leaderboard', async (req, res) => {
  const currentUser = await getCurrentUser(req);
  const moduleFilter = req.query.module || 'ALL';

  try {
    const params = [];
    let where = '';
    if (moduleFilter && moduleFilter !== 'ALL') {
      where = 'WHERE e.module_code = $1';
      params.push(moduleFilter);
    }

    const result = await pool.query(
      `SELECT e.*, m.name AS module_name, u.alias, u.display_name
       FROM exams e
       JOIN modules m ON m.code = e.module_code
       JOIN users u ON u.id = e.user_id
       ${where}
       ORDER BY e.datum ASC, e.id ASC`,
      params
    );

    const byUser = new Map();
    for (const row of result.rows) {
      const mapped = mapExamRow(row);
      if (!byUser.has(row.user_id)) {
        byUser.set(row.user_id, {
          userId: row.user_id,
          alias: row.alias,
          displayName: row.display_name,
          grades: [],
          points: [],
          modules: new Set(),
        });
      }
      const bucket = byUser.get(row.user_id);
      bucket.grades.push(mapped.grade);
      bucket.points.push(mapped.punkte);
      bucket.modules.add(`${mapped.module_code} · ${mapped.module_name}`);
    }

    const ranking = Array.from(byUser.values())
      .map((bucket) => {
        const avgGrade = bucket.grades.reduce((sum, g) => sum + g, 0) / bucket.grades.length;
        const avgPoints = bucket.points.reduce((sum, p) => sum + p, 0) / bucket.points.length;
        const isMe = currentUser ? currentUser.id === bucket.userId : false;
        const anon = getAnonymousHandle(bucket.userId, bucket.alias);
        const moduleLabel = moduleFilter === 'ALL'
          ? `Gesamt (${bucket.modules.size} Module)`
          : Array.from(bucket.modules)[0];
        return {
          userId: bucket.userId,
          isCurrentUser: isMe,
          displayName: isMe ? `Du (${bucket.alias || anon.name})` : anon.name,
          avatar: isMe ? '⭐' : anon.avatar,
          moduleCode: moduleFilter === 'ALL' ? 'GESAMT' : moduleFilter,
          moduleName: moduleLabel,
          examCount: bucket.grades.length,
          atlPoints: Number(avgPoints.toFixed(1)),
          grade: Number(avgGrade.toFixed(2)),
        };
      })
      .sort((a, b) => b.grade - a.grade || b.atlPoints - a.atlPoints)
      .map((row, index) => ({ ...row, rank: index + 1, id: row.userId }));

    const count = ranking.length;
    const totalGrade = ranking.reduce((sum, row) => sum + row.grade, 0);
    const totalPoints = ranking.reduce((sum, row) => sum + row.atlPoints, 0);
    const avgGrade = count > 0 ? (totalGrade / count).toFixed(2) : 0;
    const avgPoints = count > 0 ? (totalPoints / count).toFixed(1) : 0;
    const highestGrade = count > 0 ? ranking[0].grade : 0;

    const modulesRes = await pool.query(
      `SELECT code AS module_code, name AS module_name, catalog
       FROM modules
       WHERE catalog = true
          OR code IN (SELECT DISTINCT module_code FROM exams)
       ORDER BY catalog DESC, code`
    );

    res.json({
      leaderboard: ranking,
      stats: {
        totalEntries: count,
        averageGrade: avgGrade,
        averagePoints: avgPoints,
        highestGrade,
      },
      modules: modulesRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Root UI Route: Contains exact required phrase + Rich Benchmark
// -------------------------------------------------------------
app.get('/', async (req, res) => {
  let dbStatus = 'getrennt';
  let visitorNr = 'N/A';

  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const insertRes = await pool.query(
      'INSERT INTO visits (ip_address) VALUES ($1) RETURNING id',
      [clientIp.toString()]
    );
    visitorNr = insertRes.rows[0].id;
    dbStatus = 'verbunden';
  } catch (err) {
    console.error('Database query error:', err.message);
    dbStatus = `Fehler (${err.code || 'Verbindung fehlgeschlagen'})`;
  }

  // Exact required phrase according to slide 45:
  // "Hallo von [Name] – Besucher Nr. [aus DB] – DB: verbunden – Version: [Commit-Hash]"
  const requiredOutputString = `Hallo von ${USER_NAME} – Besucher Nr. ${visitorNr} – DB: ${dbStatus} – Version: ${APP_VERSION}`;

  if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
    return res.type('text/plain').send(`${requiredOutputString}\n`);
  }

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATL-Arena | HFWI-2504-AA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 30, 49, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.25);
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: radial-gradient(circle at 10% 20%, #111a2e 0%, #080c14 90%);
      color: var(--text);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1100px; margin: 0 auto; }

    /* Required Slide Verification Banner */
    .verification-banner {
      background: linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15));
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      backdrop-filter: blur(10px);
    }
    .banner-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      color: var(--accent);
    }
    .required-string {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      color: #38bdf8;
      font-weight: 600;
      word-break: break-all;
    }

    /* Top Navigation */
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: white;
    }
    .logo-badge {
      background: #1e293b;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      font-weight: 700;
      color: #60a5fa;
    }
    .logo h1 { font-size: 20px; font-weight: 700; }
    .user-pill {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 8px 16px;
      border-radius: 30px;
      font-size: 14px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-outline { background: transparent; border: 1px solid var(--card-border); color: var(--text-muted); }
    .btn-outline:hover { background: rgba(255,255,255,0.05); color: white; }
    .btn-accent { background: var(--accent); color: #042f2e; font-weight: 700; }
    .btn-accent:hover { filter: brightness(1.1); }

    /* Layout Grid */
    .grid-main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 30px;
    }
    @media (max-width: 860px) {
      .grid-main { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Calculator Widget */
    .calc-display {
      background: rgba(10, 15, 26, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
      position: relative;
    }
    .calc-grade {
      font-size: 48px;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
      text-shadow: 0 0 20px var(--accent-glow);
    }
    .calc-label {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .calc-status {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
    }
    .status-pass { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-fail { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    .slider-group {
      margin-bottom: 16px;
    }
    .slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .slider-label span strong { color: white; }
    input[type=range] {
      width: 100%;
      height: 6px;
      border-radius: 5px;
      background: #1e293b;
      outline: none;
      -webkit-appearance: none;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--primary);
      cursor: pointer;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
    }
    .form-group {
      margin-bottom: 14px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .form-control {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: white;
      font-size: 14px;
      font-family: inherit;
    }
    .form-control:focus { outline: none; border-color: var(--primary); }

    /* Stats Ribbon */
    .stats-ribbon {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }
    @media (max-width: 600px) {
      .stats-ribbon { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 18px;
    }
    .stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; color: white; }

    /* Leaderboard Table */
    .table-container {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      padding: 12px 16px;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 14px 16px;
      font-size: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    tr.is-me {
      background: rgba(59, 130, 246, 0.12);
      border-left: 3px solid var(--primary);
      font-weight: 600;
    }
    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-weight: 700;
      font-size: 13px;
    }
    .rank-1 { background: #fbbf24; color: #78350f; }
    .rank-2 { background: #cbd5e1; color: #1e293b; }
    .rank-3 { background: #d97706; color: #fff; }
    .grade-badge {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 13px;
    }
    .grade-top { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .grade-mid { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .grade-low { background: rgba(239, 68, 68, 0.2); color: #f87171; }

    /* Modal */
    .modal-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(5px);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal {
      background: #111827;
      border: 1px solid var(--card-border);
      border-radius: 16px;
      max-width: 440px;
      width: 90%;
      padding: 28px;
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- 1. Offizielle Übungs-Verifikation (Folie 45) -->
    <div class="verification-banner">
      <div>
        <div class="banner-title">● Modul 042 Deployment-Verifikation</div>
        <div class="required-string">${requiredOutputString}</div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); text-align: right;">
        Healthcheck: <a href="/health" style="color: #38bdf8;">/health (200 OK)</a><br>
        PostgreSQL Cluster: persistent
      </div>
    </div>

    <!-- 2. Header & Auth Navigation -->
    <header class="navbar">
      <a href="/" class="logo">
        <div class="logo-badge">WINF</div>
        <div>
          <h1>ATL-Arena Punkterechner</h1>
          <p style="font-size: 13px; color: var(--text-muted);">HFWI-2504-AA • 2. Studienjahr • HKV Aarau</p>
        </div>
      </a>
      <div id="authNav">
        <button class="btn btn-primary" onclick="openAuthModal()">Anmelden / Registrieren</button>
      </div>
    </header>

    <!-- 3. Key Statistics Ribbon -->
    <div class="stats-ribbon">
      <div class="stat-box">
        <div class="stat-label">Gesamtbeiträge</div>
        <div class="stat-value" id="statEntries">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Klassenschnitt (Ø)</div>
        <div class="stat-value" id="statAvgGrade" style="color: #60a5fa;">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Ø ATL-Punkte</div>
        <div class="stat-value" id="statAvgPoints">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Bestnote</div>
        <div class="stat-value" id="statHighestGrade" style="color: #34d399;">-</div>
      </div>
    </div>

    <!-- 4. Main Two-Column View -->
    <div class="grid-main">
      
      <!-- Left: Interactive Swiss Grade Calculator & Submission -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🧮 Schweizer ATL-Notenrechner</div>
          <span style="font-size: 12px; color: var(--text-muted);">Formel: Note = Pkt / Max × 5 + 1 (Schritt ${GRADE_ROUNDING_STEP})</span>
        </div>

        <div class="calc-display">
          <div class="calc-grade" id="calcGradeDisplay">4.8</div>
          <div class="calc-label" id="calcDetailsDisplay">60 von 80 Punkten (75%)</div>
          <div class="calc-status status-pass" id="calcStatusBadge">Bestanden • Sehr Gut</div>
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <span>Erreichte ATL-Punkte:</span>
            <span><strong id="sliderPointsValue">60</strong> Pkt</span>
          </div>
          <input type="range" id="ptsSlider" min="0" max="80" step="0.5" value="60" oninput="updateCalculator()">
        </div>

        <form id="scoreForm" onsubmit="submitScore(event)">
          <div class="form-group">
            <label>Modul</label>
            <select class="form-control" id="moduleCodeSelect" required>
              ${HFWI_MODULES.map((m) => `<option value="${m.code}" ${m.code === 'CHMG' ? 'selected' : ''}>${m.code} – ${m.name} (${m.lektionen} Lekt.)</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label>Typ</label>
              <select class="form-control" id="examTypeSelect">
                <option value="ATL" selected>ATL</option>
                <option value="Mastery Test">Mastery Test</option>
                <option value="Jahresprüfung">Jahresprüfung</option>
              </select>
            </div>
            <div>
              <label>Nummer</label>
              <input type="number" class="form-control" id="examNumberInput" value="1" min="1" step="1" required>
            </div>
          </div>

          <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label>Maximale Punktzahl</label>
              <input type="number" class="form-control" id="maxPointsInput" value="80" min="1" max="500" step="0.5" oninput="updateCalculator()">
            </div>
            <div>
              <label>Datum</label>
              <input type="date" class="form-control" id="examDateInput">
            </div>
          </div>

          <div id="neededPointsBox" style="background: rgba(15,23,42,0.6); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px;">Was brauche ich?</div>
            <div id="neededPointsGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 13px;"></div>
          </div>

          <button type="submit" class="btn btn-accent" style="width: 100%; padding: 12px; margin-top: 4px;">
            ✦ Prüfung in der Rangliste speichern
          </button>
        </form>
      </div>

      <!-- Right: My Registered Grades (if logged in) or Quick Pitch -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">👤 Mein persönliches Profil</div>
          <span id="profileStatusBadge" style="font-size: 12px; color: var(--text-muted);">Gast</span>
        </div>

        <div id="myScoresContent">
          <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">🎓</div>
            <h3 style="color: white; margin-bottom: 8px;">Noch nicht angemeldet</h3>
            <p style="font-size: 14px; margin-bottom: 20px;">
              Erstelle mit deiner E-Mail einen schnellen Account, um deine ATL-Noten dauerhaft zu speichern und deinen Klassenrang live zu vergleichen.
            </p>
            <button class="btn btn-primary" onclick="openAuthModal()">Jetzt Account anlegen</button>
          </div>
        </div>
      </div>

    </div>

    <!-- 5. Live Anonymized Leaderboard -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">🏆 Klassen-Ranking (Live-Benchmark)</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
            Andere Studenten werden zum Schutz der Privatsphäre vollständig anonymisiert dargestellt. Du siehst deine eigene Platzierung farblich hervorgehoben.
          </p>
        </div>
        <div>
          <select class="form-control" id="leaderboardFilter" onchange="loadLeaderboard()" style="width: auto;">
            <option value="ALL" selected>Gesamt (Ø aller Prüfungen)</option>
            ${HFWI_MODULES.map((m) => `<option value="${m.code}">${m.code} – ${m.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 60px;">Rang</th>
              <th>Alias</th>
              <th>Modul</th>
              <th>Prüfungen / Ø Pkt</th>
              <th>Ø Note</th>
            </tr>
          </thead>
          <tbody id="leaderboardBody">
            <tr>
              <td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">Lade Benchmark-Daten...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <footer style="margin-top: 40px; text-align: center; font-size: 13px; color: var(--text-muted); border-top: 1px solid var(--card-border); padding-top: 20px;">
      Entwickelt von <strong>Alban</strong> für ATL-Arena • Klasse HFWI-2504-AA • Modul 042 • Continuous Deployment via GitHub Actions & Docker Compose
    </footer>

  </div>

  <!-- Auth Modal -->
  <div class="modal-backdrop" id="authModal">
    <div class="modal">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 id="modalTitle" style="font-size: 20px;">Anmelden / Registrieren</h2>
        <button onclick="closeAuthModal()" style="background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer;">&times;</button>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--card-border); padding-bottom: 10px;">
        <button class="btn btn-outline" id="tabLogin" onclick="switchAuthTab('login')" style="flex: 1;">Login</button>
        <button class="btn btn-primary" id="tabRegister" onclick="switchAuthTab('register')" style="flex: 1;">Registrieren</button>
      </div>

      <form id="authForm" onsubmit="handleAuthSubmit(event)">
        <div class="form-group" id="nameFieldGroup" style="display: none;">
          <label>Dein Name / Anzeigename</label>
          <input type="text" class="form-control" id="authName" placeholder="z.B. Alban">
        </div>

        <div class="form-group">
          <label>E-Mail Adresse</label>
          <input type="email" class="form-control" id="authEmail" required placeholder="name@stud.hkv.ch">
        </div>

        <div class="form-group">
          <label>Passwort</label>
          <input type="password" class="form-control" id="authPassword" required placeholder="Mindestens 6 Zeichen">
        </div>

        <div id="authError" style="color: var(--danger); font-size: 13px; margin-bottom: 12px; display: none;"></div>

        <button type="submit" class="btn btn-primary" id="authSubmitBtn" style="width: 100%; padding: 12px;">
          Konto erstellen
        </button>
      </form>
    </div>
  </div>

  <script>
    let currentUser = null;
    let authMode = 'register';

    // Calculation logic
    const GRADE_ROUNDING_STEP = ${GRADE_ROUNDING_STEP};
    const TARGET_GRADES = [4.0, 5.0, 5.5, 6.0];

    function calculateSwissGrade(pts, max) {
      if (!max || max <= 0 || isNaN(pts)) return 1.0;
      const g = (pts / max) * 5 + 1;
      const clamped = Math.max(1.0, Math.min(6.0, g));
      return Math.round(clamped / GRADE_ROUNDING_STEP) * GRADE_ROUNDING_STEP;
    }

    function pointsNeededForGrade(target, max) {
      return Math.max(0, ((target - 1) / 5) * max);
    }

    function updateCalculator() {
      const slider = document.getElementById('ptsSlider');
      const maxInput = document.getElementById('maxPointsInput');
      const points = parseFloat(slider.value) || 0;
      const max = parseFloat(maxInput.value) || 100;

      slider.max = max;
      if (parseFloat(slider.value) > max) slider.value = max;
      document.getElementById('sliderPointsValue').textContent = parseFloat(slider.value).toFixed(1);

      const grade = calculateSwissGrade(parseFloat(slider.value), max);
      const pct = Math.round((parseFloat(slider.value) / max) * 100);

      document.getElementById('calcGradeDisplay').textContent = grade.toFixed(1);
      document.getElementById('calcDetailsDisplay').textContent = \`\${slider.value} von \${max} Punkten (\${pct}%)\`;

      const badge = document.getElementById('calcStatusBadge');
      if (grade >= 5.5) {
        badge.className = 'calc-status status-pass';
        badge.textContent = 'Sehr Gut • Höchstnote';
      } else if (grade >= 4.0) {
        badge.className = 'calc-status status-pass';
        badge.textContent = 'Bestanden • Genügend';
      } else {
        badge.className = 'calc-status status-fail';
        badge.textContent = 'Ungenügend';
      }

      document.getElementById('neededPointsGrid').innerHTML = TARGET_GRADES.map((target) => {
        const need = pointsNeededForGrade(target, max);
        return '<div style="background: rgba(10,15,26,0.7); border-radius: 8px; padding: 8px; text-align: center;">'
          + '<div style="color: var(--text-muted); font-size: 11px;">Note ' + target.toFixed(1) + '</div>'
          + '<div style="font-weight: 700; font-family: JetBrains Mono, monospace;">' + need.toFixed(1) + ' Pkt</div>'
          + '</div>';
      }).join('');
    }

    // Auth functions
    function openAuthModal(mode = 'register') {
      authMode = mode;
      switchAuthTab(mode);
      document.getElementById('authModal').style.display = 'flex';
    }

    function closeAuthModal() {
      document.getElementById('authModal').style.display = 'none';
    }

    function switchAuthTab(mode) {
      authMode = mode;
      document.getElementById('authError').style.display = 'none';
      if (mode === 'login') {
        document.getElementById('modalTitle').textContent = 'Anmelden';
        document.getElementById('nameFieldGroup').style.display = 'none';
        document.getElementById('authSubmitBtn').textContent = 'Einloggen';
        document.getElementById('tabLogin').className = 'btn btn-primary';
        document.getElementById('tabRegister').className = 'btn btn-outline';
      } else {
        document.getElementById('modalTitle').textContent = 'Konto erstellen';
        document.getElementById('nameFieldGroup').style.display = 'block';
        document.getElementById('authSubmitBtn').textContent = 'Registrieren';
        document.getElementById('tabLogin').className = 'btn btn-outline';
        document.getElementById('tabRegister').className = 'btn btn-primary';
      }
    }

    async function handleAuthSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('authEmail').value;
      const password = document.getElementById('authPassword').value;
      const displayName = document.getElementById('authName').value;
      const errBox = document.getElementById('authError');
      errBox.style.display = 'none';

      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const payload = authMode === 'login' ? { email, password } : { email, password, display_name: displayName };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          errBox.textContent = data.error || 'Fehler aufgetreten';
          errBox.style.display = 'block';
          return;
        }
        currentUser = data.user;
        closeAuthModal();
        renderUserNav();
        loadMyScores();
        loadLeaderboard();
      } catch (err) {
        errBox.textContent = 'Netzwerkfehler: ' + err.message;
        errBox.style.display = 'block';
      }
    }

    async function logout() {
      await fetch('/api/logout', { method: 'POST' });
      currentUser = null;
      renderUserNav();
      loadMyScores();
      loadLeaderboard();
    }

    function renderUserNav() {
      const nav = document.getElementById('authNav');
      const profileBadge = document.getElementById('profileStatusBadge');
      if (currentUser) {
        const label = currentUser.alias || currentUser.display_name;
        profileBadge.textContent = 'Eingeloggt als ' + label;
        profileBadge.style.color = '#34d399';
        nav.innerHTML = \`
          <div class="user-pill">
            <span>👋 <strong>\${label}</strong></span>
            <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="logout()">Abmelden</button>
          </div>
        \`;
      } else {
        profileBadge.textContent = 'Gast';
        profileBadge.style.color = 'var(--text-muted)';
        nav.innerHTML = \`<button class="btn btn-primary" onclick="openAuthModal('login')">Anmelden / Registrieren</button>\`;
      }
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        currentUser = data.user;
        renderUserNav();
        if (currentUser) {
          loadMyScores();
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Submit score
    async function submitScore(e) {
      e.preventDefault();
      if (!currentUser) {
        openAuthModal('register');
        return;
      }

      const moduleCode = document.getElementById('moduleCodeSelect').value;
      const typ = document.getElementById('examTypeSelect').value;
      const nummer = parseInt(document.getElementById('examNumberInput').value, 10) || 1;
      const points = parseFloat(document.getElementById('ptsSlider').value);
      const maxPoints = parseFloat(document.getElementById('maxPointsInput').value) || 100;
      const datum = document.getElementById('examDateInput').value || new Date().toISOString().slice(0, 10);

      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module_code: moduleCode,
            typ,
            nummer,
            punkte: points,
            max_punkte: maxPoints,
            datum
          })
        });
        if (res.ok) {
          loadMyScores();
          loadLeaderboard();
        } else {
          const err = await res.json();
          alert('Fehler: ' + (err.error || 'Konnte nicht speichern'));
        }
      } catch (err) {
        alert('Netzwerkfehler: ' + err.message);
      }
    }

    async function deleteScore(id) {
      if (!confirm('Ergebnis wirklich löschen?')) return;
      await fetch('/api/scores/' + id, { method: 'DELETE' });
      loadMyScores();
      loadLeaderboard();
    }

    async function loadMyScores() {
      const container = document.getElementById('myScoresContent');
      if (!currentUser) {
        container.innerHTML = \`
          <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">🎓</div>
            <h3 style="color: white; margin-bottom: 8px;">Noch nicht angemeldet</h3>
            <p style="font-size: 14px; margin-bottom: 20px;">
              Erstelle mit deiner E-Mail einen schnellen Account, um deine ATL-Noten dauerhaft zu speichern und deinen Klassenrang live zu vergleichen.
            </p>
            <button class="btn btn-primary" onclick="openAuthModal('register')">Jetzt Account anlegen</button>
          </div>
        \`;
        return;
      }

      try {
        const res = await fetch('/api/scores/my');
        const data = await res.json();
        const scores = data.scores || [];

        if (scores.length === 0) {
          container.innerHTML = \`
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
              <div style="font-size: 40px; margin-bottom: 12px;">📝</div>
              <h3 style="color: white; margin-bottom: 8px;">Noch keine Noten erfasst</h3>
              <p style="font-size: 14px;">Wähle links deine ATL-Punkte und klicke auf "Speichern".</p>
            </div>
          \`;
          return;
        }

        let myAvg = 0;
        let html = '<div style="display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto;">';
        scores.forEach(s => {
          myAvg += parseFloat(s.grade);
          html += \`
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; color: white;">\${s.module_code} – \${s.module_name}</div>
                <div style="font-size: 12px; color: var(--text-muted);">\${s.typ} \${s.nummer} • \${s.punkte} / \${s.max_punkte} Pkt • \${s.datum || ''}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="grade-badge \${s.grade >= 5.0 ? 'grade-top' : s.grade >= 4.0 ? 'grade-mid' : 'grade-low'}">\${parseFloat(s.grade).toFixed(1)}</span>
                <button onclick="deleteScore(\${s.id})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px;">&times;</button>
              </div>
            </div>
          \`;
        });
        html += '</div>';

        const gpa = (myAvg / scores.length).toFixed(2);
        html = \`
          <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px;">Dein aktueller WInf-Notenschnitt:</span>
            <span style="font-size: 20px; font-weight: 800; color: #60a5fa; font-family: monospace;">\${gpa}</span>
          </div>
        \` + html;

        container.innerHTML = html;
      } catch (err) {
        console.error(err);
      }
    }

    // Load leaderboard
    async function loadLeaderboard() {
      const filter = document.getElementById('leaderboardFilter');
      const mod = filter.value;
      try {
        const res = await fetch('/api/leaderboard?module=' + encodeURIComponent(mod));
        const data = await res.json();

        if (data.modules) {
          const existing = new Set(Array.from(filter.options).map((o) => o.value));
          data.modules.forEach((m) => {
            if (!existing.has(m.module_code)) {
              const opt = document.createElement('option');
              opt.value = m.module_code;
              opt.textContent = m.module_code + ' – ' + m.module_name;
              filter.appendChild(opt);
            }
          });
        }

        // Update stats
        document.getElementById('statEntries').textContent = data.stats.totalEntries;
        document.getElementById('statAvgGrade').textContent = data.stats.averageGrade;
        document.getElementById('statAvgPoints').textContent = data.stats.averagePoints + ' Pkt';
        document.getElementById('statHighestGrade').textContent = data.stats.highestGrade;

        const tbody = document.getElementById('leaderboardBody');
        if (data.leaderboard.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">Keine Einträge für dieses Modul gefunden.</td></tr>';
          return;
        }

        let rowsHtml = '';
        data.leaderboard.forEach(item => {
          let rankClass = '';
          if (item.rank === 1) rankClass = 'rank-1';
          else if (item.rank === 2) rankClass = 'rank-2';
          else if (item.rank === 3) rankClass = 'rank-3';

          const gradeClass = item.grade >= 5.0 ? 'grade-top' : item.grade >= 4.0 ? 'grade-mid' : 'grade-low';

          rowsHtml += \`
            <tr class="\${item.isCurrentUser ? 'is-me' : ''}">
              <td>
                <span class="rank-badge \${rankClass}">\${item.rank}</span>
              </td>
              <td>
                <span style="margin-right: 8px;">\${item.avatar}</span>
                <strong>\${item.displayName}</strong>
              </td>
              <td>
                <span style="font-weight: 600; color: #e2e8f0;">\${item.moduleCode}</span>
                <span style="font-size: 12px; color: var(--text-muted); display: block;">\${item.moduleName}</span>
              </td>
              <td>
                <span style="font-family: monospace;">\${item.examCount || 1}</span> • Ø \${item.atlPoints} Pkt
              </td>
              <td>
                <span class="grade-badge \${gradeClass}">\${Number(item.grade).toFixed(2)}</span>
              </td>
            </tr>
          \`;
        });

        tbody.innerHTML = rowsHtml;
      } catch (err) {
        console.error(err);
      }
    }

    const dateInput = document.getElementById('examDateInput');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    updateCalculator();
    checkAuth();
    loadLeaderboard();
  </script>
</body>
</html>`;

  res.send(html);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on port ${PORT}`);
  await initDb();
});
