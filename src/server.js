const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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

// Calculate Swiss grade from points
function calculateSwissGrade(points, maxPoints = 100) {
  const pts = parseFloat(points);
  const max = parseFloat(maxPoints);
  if (!max || max <= 0 || isNaN(pts)) return 1.0;
  const grade = (pts / max) * 5 + 1;
  const clamped = Math.max(1.0, Math.min(6.0, grade));
  return Math.round(clamped * 10) / 10; // Round to 0.1
}

// Anonymization nicknames and avatars
const AVATARS = ['🦊', '🐺', '🦉', '🐱', '🦄', '🐯', '🐼', '🦅', '🦁', '🐻'];
function getAnonymousHandle(userId) {
  const avatar = AVATARS[userId % AVATARS.length];
  const hash = ((userId * 9301 + 49297) % 233280).toString(16).toUpperCase().padStart(4, '0');
  return { name: `WInf-Student #${hash}`, avatar };
}

// Initialize database schema and pre-populate initial benchmark cohort
async function initDb() {
  let attempts = 10;
  while (attempts > 0) {
    try {
      // 1. Visitors table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitors (
          id SERIAL PRIMARY KEY,
          visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(100)
        );
      `);

      // 2. Users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          display_name VARCHAR(100) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Module Scores / ATL table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS module_scores (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          module_code VARCHAR(50) NOT NULL,
          module_name VARCHAR(255) NOT NULL,
          atl_points NUMERIC(5,2) NOT NULL,
          max_points NUMERIC(5,2) DEFAULT 100,
          grade NUMERIC(3,1) NOT NULL,
          semester VARCHAR(50) DEFAULT 'HS26',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed benchmark users if empty
      const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
      if (parseInt(existingUsers.rows[0].count, 10) === 0) {
        console.log('Seeding initial Wirtschaftsinformatik benchmark cohort...');
        const pwHash = await bcrypt.hash('DemoPassword123!', BCRYPT_ROUNDS);
        
        // Seed primary user (Alban)
        const albanRes = await pool.query(
          `INSERT INTO users (email, display_name, password_hash)
           VALUES ($1, $2, $3) RETURNING id`,
          ['alban@hkv.ch', 'Alban', pwHash]
        );
        const albanId = albanRes.rows[0].id;

        // Seed peer students for benchmark
        const cohort = [
          { email: 'student1@hkv.ch', name: 'Anonymous Student 1', points: 94.0, code: 'Modul 042', modName: 'Applications Engineering' },
          { email: 'student2@hkv.ch', name: 'Anonymous Student 2', points: 87.5, code: 'Modul 042', modName: 'Applications Engineering' },
          { email: 'student3@hkv.ch', name: 'Anonymous Student 3', points: 82.0, code: 'Modul 042', modName: 'Applications Engineering' },
          { email: 'student4@hkv.ch', name: 'Anonymous Student 4', points: 76.0, code: 'Modul 042', modName: 'Applications Engineering' },
          { email: 'student5@hkv.ch', name: 'Anonymous Student 5', points: 91.0, code: 'Modul 114', modName: 'Datenkompression & Codierung' },
          { email: 'student6@hkv.ch', name: 'Anonymous Student 6', points: 68.5, code: 'Modul 042', modName: 'Applications Engineering' },
        ];

        // Add Alban's score
        await pool.query(
          `INSERT INTO module_scores (user_id, module_code, module_name, atl_points, max_points, grade)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [albanId, 'Modul 042', 'Applications Engineering', 96.0, 100, calculateSwissGrade(96.0, 100)]
        );

        for (const peer of cohort) {
          const peerRes = await pool.query(
            `INSERT INTO users (email, display_name, password_hash)
             VALUES ($1, $2, $3) RETURNING id`,
            [peer.email, peer.name, pwHash]
          );
          await pool.query(
            `INSERT INTO module_scores (user_id, module_code, module_name, atl_points, max_points, grade)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [peerRes.rows[0].id, peer.code, peer.modName, peer.points, 100, calculateSwissGrade(peer.points, 100)]
          );
        }
      }

      console.log('Database initialized successfully: tables ready.');
      return;
    } catch (err) {
      console.error(`Database connection pending... (${attempts} attempts left)`, err.message);
      attempts--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Session helper
async function getCurrentUser(req) {
  const userId = req.signedCookies[SESSION_COOKIE];
  if (!userId) return null;
  try {
    const res = await pool.query('SELECT id, email, display_name FROM users WHERE id = $1', [userId]);
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
    const scoreCount = await pool.query('SELECT COUNT(*) FROM module_scores');
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      registeredUsers: parseInt(userCount.rows[0].count, 10),
      moduleScores: parseInt(scoreCount.rows[0].count, 10),
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
    const result = await pool.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3) RETURNING id, email, display_name`,
      [email.toLowerCase().trim(), name, hash]
    );
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
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name } });
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
app.get('/api/scores/my', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const result = await pool.query(
      `SELECT * FROM module_scores WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );
    res.json({ scores: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scores', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Bitte zuerst einloggen oder registrieren.' });

  const { module_code, module_name, atl_points, max_points, semester } = req.body;
  const pts = parseFloat(atl_points);
  const max = parseFloat(max_points) || 100;

  if (isNaN(pts) || pts < 0 || pts > max) {
    return res.status(400).json({ error: `Punkte müssen zwischen 0 und ${max} liegen.` });
  }

  const grade = calculateSwissGrade(pts, max);
  const code = (module_code || 'Modul 042').trim();
  const name = (module_name || 'Applications Engineering').trim();
  const sem = (semester || 'HS26').trim();

  try {
    const result = await pool.query(
      `INSERT INTO module_scores (user_id, module_code, module_name, atl_points, max_points, grade, semester)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [user.id, code, name, pts, max, grade, sem]
    );
    res.status(201).json({ score: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scores/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    await pool.query('DELETE FROM module_scores WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anonymized Leaderboard & Benchmark
app.get('/api/leaderboard', async (req, res) => {
  const currentUser = await getCurrentUser(req);
  const moduleFilter = req.query.module;

  try {
    let query = `
      SELECT 
        s.id,
        s.user_id,
        s.module_code,
        s.module_name,
        s.atl_points,
        s.max_points,
        s.grade,
        s.created_at,
        u.display_name
      FROM module_scores s
      JOIN users u ON s.user_id = u.id
    `;
    const params = [];
    if (moduleFilter && moduleFilter !== 'ALL') {
      query += ` WHERE s.module_code = $1`;
      params.push(moduleFilter);
    }
    query += ` ORDER BY s.grade DESC, s.atl_points DESC, s.created_at ASC`;

    const result = await pool.query(query, params);
    const rows = result.rows;

    let totalPoints = 0;
    let totalGrade = 0;
    const ranking = rows.map((row, index) => {
      totalPoints += parseFloat(row.atl_points);
      totalGrade += parseFloat(row.grade);
      const isMe = currentUser ? currentUser.id === row.user_id : false;
      const anon = getAnonymousHandle(row.user_id);

      return {
        rank: index + 1,
        id: row.id,
        isCurrentUser: isMe,
        displayName: isMe ? `Du (${row.display_name})` : anon.name,
        avatar: isMe ? '⭐' : anon.avatar,
        moduleCode: row.module_code,
        moduleName: row.module_name,
        atlPoints: parseFloat(row.atl_points),
        maxPoints: parseFloat(row.max_points),
        grade: parseFloat(row.grade)
      };
    });

    const count = rows.length;
    const avgGrade = count > 0 ? (totalGrade / count).toFixed(2) : 0;
    const avgPoints = count > 0 ? (totalPoints / count).toFixed(1) : 0;
    const highestGrade = count > 0 ? rows[0].grade : 0;

    // Available modules for filter dropdown
    const modulesRes = await pool.query('SELECT DISTINCT module_code, module_name FROM module_scores ORDER BY module_code');

    res.json({
      leaderboard: ranking,
      stats: {
        totalEntries: count,
        averageGrade: avgGrade,
        averagePoints: avgPoints,
        highestGrade: highestGrade
      },
      modules: modulesRes.rows
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
      'INSERT INTO visitors (ip_address) VALUES ($1) RETURNING id',
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
  <title>WInf ATL Benchmark & Punkterechner | Modul 042</title>
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
          <h1>ATL Punkterechner & Benchmark</h1>
          <p style="font-size: 13px; color: var(--text-muted);">Wirtschaftsinformatik HF / Studium • HKV Aarau</p>
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
          <span style="font-size: 12px; color: var(--text-muted);">Formel: (Pkt / Max * 5) + 1</span>
        </div>

        <div class="calc-display">
          <div class="calc-grade" id="calcGradeDisplay">5.8</div>
          <div class="calc-label" id="calcDetailsDisplay">96 von 100 Punkten (96%)</div>
          <div class="calc-status status-pass" id="calcStatusBadge">Bestanden • Sehr Gut</div>
        </div>

        <div class="slider-group">
          <div class="slider-label">
            <span>Erreichte ATL-Punkte:</span>
            <span><strong id="sliderPointsValue">96</strong> Pkt</span>
          </div>
          <input type="range" id="ptsSlider" min="0" max="100" step="0.5" value="96" oninput="updateCalculator()">
        </div>

        <form id="scoreForm" onsubmit="submitScore(event)">
          <div class="form-group">
            <label>Modul auswählen oder eingeben</label>
            <select class="form-control" id="moduleCodeSelect" onchange="handleModuleSelect(this)">
              <option value="Modul 042" data-name="Applications Engineering">Modul 042 - Applications Engineering</option>
              <option value="Modul 114" data-name="Datenkompression & Codierung">Modul 114 - Datenkompression & Codierung</option>
              <option value="Modul 120" data-name="Benutzerschnittstellen">Modul 120 - Benutzerschnittstellen</option>
              <option value="Modul 122" data-name="Abläufe mit Skripten automatisieren">Modul 122 - Automatisierung mit Skripten</option>
              <option value="Modul 151" data-name="Web-Applikationen mit DB einbinden">Modul 151 - Web-Applikationen mit DB</option>
              <option value="CUSTOM">Eigenes Modul eingeben...</option>
            </select>
          </div>

          <div class="form-group" id="customModuleGroup" style="display: none;">
            <label>Eigenes Modul / Fach</label>
            <input type="text" class="form-control" id="customModuleName" placeholder="z.B. Modul 306 - Kleinprojekte">
          </div>

          <div class="form-group">
            <label>Maximale Punktzahl</label>
            <input type="number" class="form-control" id="maxPointsInput" value="100" min="10" max="500" oninput="updateCalculator()">
          </div>

          <button type="submit" class="btn btn-accent" style="width: 100%; padding: 12px; margin-top: 10px;">
            ✦ Mein Ergebnis im Klassen-Ranking speichern
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
            <option value="ALL">Alle Module</option>
            <option value="Modul 042" selected>Modul 042 (Applications Engineering)</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 60px;">Rang</th>
              <th>Student / Pseudonym</th>
              <th>Modul</th>
              <th>Erreichte ATL</th>
              <th>Schweizer Note</th>
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
      Entwickelt von <strong>Alban</strong> für Modul 042 Applications Engineering • HKV Aarau • Continuous Deployment via GitHub Actions & Docker Compose
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
    function calculateSwissGrade(pts, max) {
      if (!max || max <= 0 || isNaN(pts)) return 1.0;
      const g = (pts / max) * 5 + 1;
      const clamped = Math.max(1.0, Math.min(6.0, g));
      return Math.round(clamped * 10) / 10;
    }

    function updateCalculator() {
      const slider = document.getElementById('ptsSlider');
      const maxInput = document.getElementById('maxPointsInput');
      const points = parseFloat(slider.value) || 0;
      const max = parseFloat(maxInput.value) || 100;

      slider.max = max;
      document.getElementById('sliderPointsValue').textContent = points.toFixed(1);

      const grade = calculateSwissGrade(points, max);
      const pct = Math.round((points / max) * 100);

      document.getElementById('calcGradeDisplay').textContent = grade.toFixed(1);
      document.getElementById('calcDetailsDisplay').textContent = \`\${points} von \${max} Punkten (\${pct}%)\`;

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
    }

    function handleModuleSelect(sel) {
      const customGroup = document.getElementById('customModuleGroup');
      if (sel.value === 'CUSTOM') {
        customGroup.style.display = 'block';
      } else {
        customGroup.style.display = 'none';
      }
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
        profileBadge.textContent = 'Eingeloggt als ' + currentUser.display_name;
        profileBadge.style.color = '#34d399';
        nav.innerHTML = \`
          <div class="user-pill">
            <span>👋 <strong>\${currentUser.display_name}</strong></span>
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

      const sel = document.getElementById('moduleCodeSelect');
      let moduleCode = sel.value;
      let moduleName = sel.options[sel.selectedIndex].getAttribute('data-name') || moduleCode;

      if (moduleCode === 'CUSTOM') {
        const customName = document.getElementById('customModuleName').value.trim();
        if (!customName) {
          alert('Bitte Modul-Name eingeben.');
          return;
        }
        moduleCode = customName.split(' ')[0] || 'Eigenes';
        moduleName = customName;
      }

      const points = parseFloat(document.getElementById('ptsSlider').value);
      const maxPoints = parseFloat(document.getElementById('maxPointsInput').value) || 100;

      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module_code: moduleCode,
            module_name: moduleName,
            atl_points: points,
            max_points: maxPoints
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
                <div style="font-weight: 700; color: white;">\${s.module_code} - \${s.module_name}</div>
                <div style="font-size: 12px; color: var(--text-muted);">\${s.atl_points} / \${s.max_points} Pkt • \${s.semester || 'HS26'}</div>
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
      const mod = document.getElementById('leaderboardFilter').value;
      try {
        const res = await fetch('/api/leaderboard?module=' + encodeURIComponent(mod));
        const data = await res.json();

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
                <span style="font-family: monospace;">\${item.atlPoints}</span> / \${item.maxPoints} Pkt
              </td>
              <td>
                <span class="grade-badge \${gradeClass}">\${item.grade.toFixed(1)}</span>
              </td>
            </tr>
          \`;
        });

        tbody.innerHTML = rowsHtml;
      } catch (err) {
        console.error(err);
      }
    }

    // Initial load
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
