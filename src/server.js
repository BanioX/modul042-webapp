const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_NAME = process.env.APP_NAME || 'Alban';
const APP_VERSION = process.env.APP_VERSION || 'dev-local';

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'webapp_db',
  user: process.env.DB_USER || 'webapp_user',
  password: process.env.DB_PASSWORD || 'secret123',
  connectionTimeoutMillis: 5000,
  max: 10,
});

// Initialize database schema
async function initDb() {
  let attempts = 10;
  while (attempts > 0) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitors (
          id SERIAL PRIMARY KEY,
          visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(100)
        );
      `);
      console.log('Database initialized successfully: visitors table ready.');
      return;
    } catch (err) {
      console.error(`Database connection pending... (${attempts} attempts left)`, err.message);
      attempts--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Healthcheck endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
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

// Root endpoint: displays exact required output
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

  // Exact required phrase according to task specification:
  // "Hallo von [Name] – Besucher Nr. [aus DB] – DB: verbunden – Version: [Commit-Hash]"
  const messageText = `Hallo von ${USER_NAME} – Besucher Nr. ${visitorNr} – DB: ${dbStatus} – Version: ${APP_VERSION}`;

  // If curl or plain text requested
  if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
    return res.type('text/plain').send(`${messageText}\n`);
  }

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevOps Webapp | Modul 042</title>
  <style>
    :root {
      --bg: #0b1320;
      --card-bg: #152238;
      --accent: #10b981;
      --text: #f3f4f6;
      --muted: #94a3b8;
      --border: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 36px 44px;
      max-width: 680px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 24px;
      line-height: 1.4;
      color: #ffffff;
    }
    .required-output {
      background: rgba(2, 6, 23, 0.6);
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 18px 22px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 16px;
      color: #38bdf8;
      margin-bottom: 28px;
      word-break: break-all;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 10px;
      text-align: left;
    }
    .metric {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
    }
    .metric-label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-val {
      font-size: 16px;
      font-weight: 600;
      margin-top: 4px;
      color: #f8fafc;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: var(--muted);
    }
    .footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● LIVE ÜBUNG APPLIKATION (MODUL 042)</div>
    <h1>HKV Aarau – DevOps Deployment</h1>

    <div class="required-output" title="Offizielle Übungs-Vorgabe">
      ${messageText}
    </div>

    <div class="grid">
      <div class="metric">
        <div class="metric-label">Entwickler</div>
        <div class="metric-val">${USER_NAME}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Besucher-Zähler (DB)</div>
        <div class="metric-val">#${visitorNr}</div>
      </div>
      <div class="metric">
        <div class="metric-label">PostgreSQL Status</div>
        <div class="metric-val" style="color: ${dbStatus === 'verbunden' ? '#10b981' : '#ef4444'}">
          ${dbStatus}
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">Git Commit Version</div>
        <div class="metric-val" style="font-family: monospace;">${APP_VERSION}</div>
      </div>
    </div>

    <div class="footer">
      Healthcheck: <a href="/health">/health</a> | Cloudflare Tunnel HTTPS Active
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on port ${PORT}`);
  await initDb();
});
