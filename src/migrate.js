const bcrypt = require('bcryptjs');
const { HFWI_MODULES, mapLegacyModuleCode, randomAlias } = require('./catalog');
const { calculateSwissGrade } = require('./grades');

const DEMO_EMAIL = 'alban@hkv.ch';
const DEMO_EXAMS = [
  { module_code: 'CHMG', typ: 'ATL', nummer: 1, punkte: 60, max_punkte: 80 },
  { module_code: 'INWI', typ: 'ATL', nummer: 1, punkte: 38, max_punkte: 40 },
  { module_code: 'INOM', typ: 'Mastery Test', nummer: 1, punkte: 10, max_punkte: 10 },
];

async function ensureColumn(pool, table, column, ddl) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
}

async function migrate(pool, { bcryptRounds }) {
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.visits') IS NULL THEN
        IF to_regclass('public.visitors') IS NOT NULL THEN
          ALTER TABLE visitors RENAME TO visits;
        ELSE
          CREATE TABLE visits (
            id SERIAL PRIMARY KEY,
            visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ip_address VARCHAR(100)
          );
        END IF;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await ensureColumn(pool, 'users', 'alias', 'VARCHAR(32)');
  await ensureColumn(pool, 'users', 'email_verified', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn(pool, 'users', 'verify_token', 'VARCHAR(128)');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_alias_unique
    ON users (alias) WHERE alias IS NOT NULL;
  `);

  const usersWithoutAlias = await pool.query('SELECT id FROM users WHERE alias IS NULL');
  for (const row of usersWithoutAlias.rows) {
    let alias = randomAlias();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await pool.query(
          'UPDATE users SET alias = $1, email_verified = true WHERE id = $2 AND alias IS NULL',
          [alias, row.id]
        );
        break;
      } catch (err) {
        if (err.code !== '23505') throw err;
        alias = randomAlias();
      }
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS modules (
      code VARCHAR(16) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      lektionen INTEGER NOT NULL,
      catalog BOOLEAN NOT NULL DEFAULT true
    );
  `);

  for (const mod of HFWI_MODULES) {
    await pool.query(
      `INSERT INTO modules (code, name, lektionen, catalog)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             lektionen = EXCLUDED.lektionen,
             catalog = true`,
      [mod.code, mod.name, mod.lektionen]
    );
  }

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exam_typ') THEN
        CREATE TYPE exam_typ AS ENUM ('ATL', 'Mastery Test', 'Jahresprüfung');
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module_code VARCHAR(16) NOT NULL REFERENCES modules(code),
      typ exam_typ NOT NULL,
      nummer INTEGER NOT NULL DEFAULT 1,
      punkte NUMERIC(6,2) NOT NULL,
      max_punkte NUMERIC(6,2) NOT NULL,
      datum DATE NOT NULL DEFAULT CURRENT_DATE
    );
  `);

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

  const legacyScores = await pool.query('SELECT * FROM module_scores ORDER BY id');
  for (const score of legacyScores.rows) {
    const code = mapLegacyModuleCode(score.module_code);
    const catalogHit = HFWI_MODULES.find((m) => m.code === code);
    await pool.query(
      `INSERT INTO modules (code, name, lektionen, catalog)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [
        code,
        catalogHit ? catalogHit.name : score.module_name,
        catalogHit ? catalogHit.lektionen : 0,
        Boolean(catalogHit),
      ]
    );

    const datum = score.created_at
      ? new Date(score.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const exists = await pool.query(
      `SELECT 1 FROM exams
       WHERE user_id = $1 AND module_code = $2 AND punkte = $3 AND max_punkte = $4
       LIMIT 1`,
      [score.user_id, code, score.atl_points, score.max_points]
    );
    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO exams (user_id, module_code, typ, nummer, punkte, max_punkte, datum)
         VALUES ($1, $2, 'ATL', 1, $3, $4, $5)`,
        [score.user_id, code, score.atl_points, score.max_points, datum]
      );
    }
  }

  let demoUser = await pool.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL]);
  if (demoUser.rows.length === 0) {
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      const pwHash = await bcrypt.hash('DemoPassword123!', bcryptRounds);
      const inserted = await pool.query(
        `INSERT INTO users (email, display_name, password_hash, alias, email_verified)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [DEMO_EMAIL, 'Alban', pwHash, randomAlias()]
      );
      demoUser = inserted;
    }
  }

  if (demoUser.rows.length > 0) {
    const demoId = demoUser.rows[0].id;
    for (const exam of DEMO_EXAMS) {
      const exists = await pool.query(
        `SELECT 1 FROM exams
         WHERE user_id = $1 AND module_code = $2 AND typ = $3 AND nummer = $4
         LIMIT 1`,
        [demoId, exam.module_code, exam.typ, exam.nummer]
      );
      if (exists.rows.length === 0) {
        await pool.query(
          `INSERT INTO exams (user_id, module_code, typ, nummer, punkte, max_punkte, datum)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
          [demoId, exam.module_code, exam.typ, exam.nummer, exam.punkte, exam.max_punkte]
        );
      }
    }
  }

  return { calculateSwissGrade };
}

module.exports = { migrate, DEMO_EMAIL, DEMO_EXAMS };
