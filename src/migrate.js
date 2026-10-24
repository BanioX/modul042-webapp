const crypto = require('crypto');
const {
  SCHOOL_YEARS, NON_MODULE_ENTRIES, lessonsFor, modulesFor,
} = require('./catalog');

/**
 * Idempotente Migration. Bestehende Tabellen der Vorgängerversion (visits, users,
 * modules, exams, module_scores) bleiben erhalten; es wird nichts gelöscht.
 */
async function migrate(pool, { admins = [], dozenten = [], students = [] } = {}) {
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
    CREATE TABLE IF NOT EXISTS app_meta (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS school_years (
      id SERIAL PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      klasse VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS alias VARCHAR(32);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(128);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'student';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP WITH TIME ZONE;

    CREATE TABLE IF NOT EXISTS participants (
      email VARCHAR(255) PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'student',
      active BOOLEAN NOT NULL DEFAULT true,
      added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_activity (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS modules (
      code VARCHAR(16) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      lektionen INTEGER NOT NULL DEFAULT 0,
      catalog BOOLEAN NOT NULL DEFAULT true
    );
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS school_year_id INTEGER REFERENCES school_years(id);
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS color VARCHAR(16);
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS dozent VARCHAR(150);

    CREATE TABLE IF NOT EXISTS lessons (
      id SERIAL PRIMARY KEY,
      school_year_id INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
      module_code VARCHAR(16) REFERENCES modules(code) ON DELETE SET NULL,
      title VARCHAR(150),
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      lektionen INTEGER,
      dozent VARCHAR(150),
      room VARCHAR(150),
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS lessons_date_idx ON lessons (date);

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      school_year_id INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
      module_code VARCHAR(16) REFERENCES modules(code) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      kind VARCHAR(32) NOT NULL DEFAULT 'Auftrag',
      max_points NUMERIC(7,2),
      due_at TIMESTAMP WITH TIME ZONE,
      counts_for_ranking BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      points NUMERIC(7,2),
      max_points NUMERIC(7,2),
      note TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (task_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS forum_threads (
      id SERIAL PRIMARY KEY,
      school_year_id INTEGER REFERENCES school_years(id) ON DELETE SET NULL,
      module_code VARCHAR(16) REFERENCES modules(code) ON DELETE SET NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'Fragen',
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      pinned BOOLEAN NOT NULL DEFAULT false,
      solved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS forum_posts (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version VARCHAR(16);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash VARCHAR(255);

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      actor_id INTEGER,
      actor_email VARCHAR(255),
      action VARCHAR(64) NOT NULL,
      target VARCHAR(255),
      details JSONB
    );
    CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);

    CREATE TABLE IF NOT EXISTS attendance (
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lesson_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS forum_likes (
      thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, user_id)
    );
  `);

  // Admins und Dozierende aus der Konfiguration stehen immer auf der Liste
  for (const [list, role] of [[admins, 'admin'], [dozenten, 'dozent']]) {
    for (const email of list) {
      await pool.query(
        `INSERT INTO participants (email, full_name, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, active = true`,
        [email, nameFromLocalPart(email), role]
      );
      await pool.query('UPDATE users SET role = $2 WHERE email = $1', [email, role]);
    }
  }

  // Studierende aus TEILNEHMER_EMAILS ergänzen; Änderungen im Admin-Bereich bleiben bestehen
  for (const email of students) {
    await pool.query(
      `INSERT INTO participants (email, full_name, role) VALUES ($1, $2, 'student')
       ON CONFLICT (email) DO NOTHING`,
      [email, nameFromLocalPart(email)]
    );
  }

  // Datensparsamkeit: keine IP-Adressen im Besucherzähler, Audit-Log max. 365 Tage
  await pool.query('UPDATE visits SET ip_address = NULL WHERE ip_address IS NOT NULL');
  await pool.query("DELETE FROM audit_log WHERE at < NOW() - INTERVAL '365 days'");
  await pool.query("DELETE FROM audit_log WHERE action = 'login_failed' AND at < NOW() - INTERVAL '30 days'");

  await pool.query(`UPDATE users SET calendar_token = md5(random()::text || id::text || clock_timestamp()::text)
                    WHERE calendar_token IS NULL`);

  const seeded = await pool.query("SELECT value FROM app_meta WHERE key = 'seed_v1'");
  if (seeded.rows.length === 0) {
    await seed(pool);
    await pool.query("INSERT INTO app_meta (key, value) VALUES ('seed_v1', $1)", [new Date().toISOString()]);
  }
}

function nameFromLocalPart(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Startdaten: Schuljahre, Module und Stundenplan aus den HFWI-Stundenplänen, Modul-042-Termine. */
async function seed(pool) {
  const yearIds = {};
  for (const year of SCHOOL_YEARS) {
    const res = await pool.query(
      `INSERT INTO school_years (label, klasse, start_date, end_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [year.label, year.klasse, year.start_date, year.end_date]
    );
    yearIds[year.key] = res.rows[0].id;
  }

  for (const year of SCHOOL_YEARS) {
    const lessons = lessonsFor(year.key);
    for (const mod of modulesFor(year.key)) {
      const dozent = lessons.find((l) => l.module === mod.code && l.dozent);
      await pool.query(
        `INSERT INTO modules (code, name, lektionen, catalog, school_year_id, color, dozent)
         VALUES ($1, $2, $3, true, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name, lektionen = EXCLUDED.lektionen,
               school_year_id = EXCLUDED.school_year_id, color = EXCLUDED.color,
               dozent = EXCLUDED.dozent`,
        [mod.code, mod.name, mod.lektionen, yearIds[year.key], mod.color, dozent ? dozent.dozent : null]
      );
    }
    for (const lesson of lessons) {
      const isModule = lesson.module && !NON_MODULE_ENTRIES.includes(lesson.module);
      await pool.query(
        `INSERT INTO lessons (school_year_id, module_code, title, date, start_time, end_time, lektionen, dozent, room, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          yearIds[year.key],
          isModule ? lesson.module : null,
          isModule ? null : lesson.module,
          lesson.date,
          lesson.start,
          lesson.end,
          lesson.lektionen,
          lesson.dozent,
          roomFor(lesson),
          lesson.note,
        ]
      );
    }
  }

  // Aufgaben aus MS Teams (HFWI-2504-AA), fällig jeweils 23:59 Schweizer Zeit
  for (const [module, title, kind, maxPoints, due] of TEAMS_TASKS) {
    const yearKey = module && MODULE_YEAR[module] ? MODULE_YEAR[module] : (due && due < '2026-04-22' ? '1' : '2');
    await pool.query(
      `INSERT INTO tasks (school_year_id, module_code, title, kind, max_points, due_at, counts_for_ranking)
       VALUES ($1, $2, $3, $4, $5, ($6 || ' 23:59')::timestamp AT TIME ZONE 'Europe/Zurich', $7)`,
      [yearIds[yearKey], module, title, kind, maxPoints, due, maxPoints !== null]
    );
  }

  await pool.query(
    `INSERT INTO forum_threads (school_year_id, category, title, body, pinned)
     VALUES ($1, 'Wissenswertes', $2, $3, true)`,
    [
      yearIds['2'],
      'Willkommen im HUB-042 👋',
      'Hier teilen wir Zusammenfassungen, Fragen zu Aufgaben und alles, was der Klasse hilft.\n\n'
      + '• Bleibt freundlich und hilfsbereit\n• Keine Prüfungslösungen posten\n'
      + '• Markiert Fragen als gelöst, wenn sie beantwortet sind',
    ]
  );
}

const MODULE_YEAR = Object.fromEntries(
  SCHOOL_YEARS.flatMap((y) => modulesFor(y.key).map((m) => [m.code, y.key]))
);

// [Modul, Titel, Art, Maximalpunkte, Fällig (Datum)]
const TEAMS_TASKS = [
  [null, 'Persönliches Vorstellvideo', 'Abgabe', null, '2025-05-06'],
  ['Kickoff', 'ATL 1', 'ATL', 34, '2025-05-25'],
  ['PROJ', 'Mastery Test (eLearning-Abschluss)', 'Mastery Test', 28, '2025-06-29'],
  ['MAMON', 'Mastery Test 1', 'Mastery Test', 10, '2025-07-02'],
  ['UNTF', 'Mastery Test 1', 'Mastery Test', 15, '2025-08-27'],
  ['FINM', 'Mastery Test', 'Mastery Test', 30, '2025-09-10'],
  ['PROJ', 'ATL 2.1', 'ATL', 10, '2025-09-14'],
  ['MAMON', 'Mastery Test 2', 'Mastery Test', null, '2025-09-17'],
  ['PROJ', 'ATL 2.2', 'ATL', 18, '2025-10-05'],
  ['UNTF', 'ATL 1', 'Mastery Test', null, '2025-10-12'],
  ['PROJ', 'ATL 2.3', 'ATL', 6, '2025-10-26'],
  ['PROJ', 'ATL 2.4', 'ATL', 8, '2025-11-09'],
  ['PROJ', 'ATL 1, Simultrain', 'ATL', 20, '2025-11-16'],
  ['MAMON', 'ATL (Logik, Statistik, Modelle)', 'ATL', 75, '2025-11-16'],
  ['FINM', 'ATL', 'ATL', 80, '2025-11-23'],
  ['NWSE', 'Mastery Test', 'Mastery Test', 28, '2025-12-17'],
  ['InfSys', 'Mastery Test', 'Mastery Test', 28, '2025-12-17'],
  ['AUSD', 'ATL', 'ATL', 42, '2025-12-21'],
  ['Leadership', 'Mastery Test', 'Mastery Test', 28, '2026-01-21'],
  ['NWSE', 'ATL 1', 'ATL', 35, '2026-02-15'],
  ['Leadership', 'ATL', 'ATL', 61, '2026-02-15'],
  ['UNTF', 'Mastery Test 2', 'Mastery Test', 15, '2026-02-18'],
  ['RECT', 'Mastery Test 1', 'Mastery Test', 20, '2026-02-25'],
  ['SPMA', 'Mastery Test 1 | BPMN 2.0', 'Mastery Test', 16, '2026-02-25'],
  ['InfSys', 'ATL 1', 'ATL', 50, '2026-03-08'],
  [null, 'Jahresprüfung 1: Präsentation', 'Jahresprüfung', 50, '2026-03-19'],
  [null, 'Jahresprüfung 1: Gruppengespräch', 'Jahresprüfung', 50, '2026-03-26'],
  [null, 'Jahresprüfung 1: Einzelgespräch', 'Jahresprüfung', 100, '2026-03-26'],
  ['SPMA', 'ATL', 'ATL', 70, '2026-04-05'],
  ['InfSys', 'ATL 2', 'ATL', 40, '2026-04-05'],
  ['NWSE', 'ATL 2', 'ATL', 35, '2026-04-19'],
  ['CHMG', 'Projektbeschrieb Changemanagement', 'Abgabe', null, '2026-05-17'],
  ['INWI', 'Mastery Test 1', 'Mastery Test', 10, '2026-06-17'],
  ['INOM', 'ATL 1', 'ATL', 30, '2026-06-28'],
  ['DSRE', 'ATL 1', 'ATL', 72, '2026-06-28'],
  ['AGMP', 'ATL 1', 'ATL', 40, '2026-07-19'],
  ['INOM', 'Vorbereitungsaufgabe Block Prototyping 29.08.2026', 'Abgabe', null, '2026-08-28'],
  ['INOM', 'Mastery Test 1', 'Mastery Test', 10, '2026-08-29'],
  ['INWI', 'ATL 1', 'ATL', 40, '2026-09-13'],
  [null, 'Jahresprüfung: Disposition, 1. Fassung', 'Jahresprüfung', 20, '2026-09-13'],
  ['CHMG', 'ATL 1', 'ATL', 80, '2026-09-16'],
  [null, 'Jahresprüfung 2: Dispo Fassung 2 (nur wenn von Experte verlangt)', 'Jahresprüfung', null, '2026-10-11'],
  ['CHMG', 'Mastery Test 1', 'Mastery Test', 26, '2026-10-14'],
  ['APPL', 'Übung Webapplikation (1–3)', 'Übung', null, '2026-10-21'],
  ['INWI', 'Mastery Test 2', 'Mastery Test', 10, '2026-11-04'],
  ['SECM', 'Mastery Test 1', 'Mastery Test', 15, '2026-11-11'],
  ['INWI', 'ATL 2', 'ATL', 40, '2026-11-15'],
  ['INOM', 'Mastery Test 2', 'Mastery Test', 16, '2026-12-02'],
  ['APPL', 'Mastery Test 1', 'Mastery Test', 24, '2026-12-09'],
  ['APPL', 'ATL 1', 'ATL', 60, '2027-01-10'],
  ['BDAI', 'Mastery Test 1', 'Mastery Test', 24, '2027-01-27'],
  [null, 'Jahresprüfung 2: Video (nur 1 Upload pro Gruppe)', 'Jahresprüfung', 15, '2027-02-14'],
  [null, 'Jahresprüfung 2: Bericht/Transferarbeit', 'Jahresprüfung', 115, '2027-02-21'],
  ['SECM', 'Mastery Test 2', 'Mastery Test', 15, '2027-02-24'],
  [null, 'Jahresprüfung 2. Studienjahr', 'Jahresprüfung', 200, '2027-03-03'],
  ['SECM', 'ATL 1', 'ATL', 70, '2027-03-07'],
  ['INOM', 'ATL 2', 'ATL', 60, '2027-03-07'],
  ['BITD', 'Mastery Test 1', 'Mastery Test', 26, '2027-03-10'],
  ['BDAI', 'ATL 1', 'ATL', 60, '2027-04-18'],
  ['BITD', 'ATL 1', 'ATL', 80, '2027-04-25'],
  ['ENGL', 'Mastery Tests Englisch', 'Mastery Test', 40, null],
  ['ENGL', 'IELTS Academic (in LLP umgerechnet)', 'Diplomprüfung', 110, null],
];

function roomFor(lesson) {
  const note = lesson.note || '';
  const match = note.match(/Zimmer\s*\d+|Aula|Mägenwil|online/i);
  if (match) return match[0];
  const weekday = new Date(`${lesson.date}T12:00:00Z`).getUTCDay();
  return weekday === 3 ? 'Zimmer 126' : null;
}

function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { migrate, newToken };
