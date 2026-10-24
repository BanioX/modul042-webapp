const { buildCalendar } = require('../ics');
const { getPublicBaseUrl } = require('../mail');
const hkv = require('../data/hkv.json');

const ZURICH_TODAY = "(NOW() AT TIME ZONE 'Europe/Zurich')::date";

const TIME_RE = /^\d{1,2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "26.08.2026" oder "2026-08-26" → "2026-08-26" */
function parseDate(value) {
  const v = String(value || '').trim();
  if (DATE_RE.test(v)) return v;
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function parseTime(value) {
  const v = String(value || '').trim();
  return TIME_RE.test(v) ? v.padStart(5, '0') : null;
}

/** CSV/Excel-Zeilen: Datum;Beginn;Ende;Lekt.;Modul;Dozent*in;Bemerkungen */
function parseLessonLines(text) {
  const rows = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((line, idx) => {
    if (!line.trim() || /^datum/i.test(line.trim())) return;
    const cols = line.split(/\t|;/).map((c) => c.trim());
    const date = parseDate(cols[0]);
    if (!date) {
      errors.push(`Zeile ${idx + 1}: Datum fehlt oder ist ungültig`);
      return;
    }
    rows.push({
      date,
      start: parseTime(cols[1]),
      end: parseTime(cols[2]),
      lektionen: parseInt(cols[3], 10) || null,
      module: cols[4] || null,
      dozent: cols[5] || null,
      note: cols[6] || null,
    });
  });
  return { rows, errors };
}

module.exports = function scheduleRoutes(app, ctx) {
  const {
    pool, requireAuth, requireManager, resolveYear, asyncRoute, audit,
  } = ctx;

  async function knownModules() {
    const res = await pool.query('SELECT code FROM modules');
    return new Set(res.rows.map((r) => r.code));
  }

  function lessonValues(body, modules) {
    const date = parseDate(body.date);
    if (!date) return { error: 'Datum fehlt oder ist ungültig.' };
    const moduleCode = body.module_code && modules.has(body.module_code) ? body.module_code : null;
    return {
      values: [
        date,
        parseTime(body.start_time),
        parseTime(body.end_time),
        parseInt(body.lektionen, 10) || null,
        moduleCode,
        moduleCode ? null : (String(body.title || body.module_code || '').trim().slice(0, 150) || null),
        String(body.dozent || '').trim().slice(0, 150) || null,
        String(body.room || '').trim().slice(0, 150) || null,
        String(body.note || '').trim().slice(0, 1000) || null,
      ],
    };
  }

  app.get('/api/schedule', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    if (!year) return res.json({ lessons: [], deadlines: [] });
    const lessons = await pool.query(
      `SELECT l.*, to_char(l.start_time, 'HH24:MI') AS start_time, to_char(l.end_time, 'HH24:MI') AS end_time,
              m.name AS module_name, m.color, (a.lesson_id IS NOT NULL) AS attended
       FROM lessons l
       LEFT JOIN modules m ON m.code = l.module_code
       LEFT JOIN attendance a ON a.lesson_id = l.id AND a.user_id = $2
       WHERE l.school_year_id = $1
       ORDER BY l.date, l.start_time NULLS FIRST`,
      [year.id, req.user.id]
    );
    const deadlines = await pool.query(
      `SELECT t.id, t.title, t.kind, t.due_at, t.module_code, m.color
       FROM tasks t LEFT JOIN modules m ON m.code = t.module_code
       WHERE t.school_year_id = $1 AND t.due_at IS NOT NULL ORDER BY t.due_at`,
      [year.id]
    );
    const inYear = (start, end) => start <= year.end_date && end >= year.start_date;
    res.json({
      year,
      lessons: lessons.rows,
      deadlines: deadlines.rows,
      holidays: [
        ...hkv.ferien.filter((f) => inYear(f.start, f.end)),
        ...hkv.feiertage.filter((f) => inYear(f.date, f.date)).map((f) => ({ name: f.name, start: f.date, end: f.date })),
      ],
      campus: hkv.campus,
      calendarUrl: `${getPublicBaseUrl(req)}/calendar/${req.user.calendar_token}.ics`,
    });
  }));

  // Präsenz-Check-in: 0.5 LLP pro Lektion (nur für vergangene oder heutige Lektionen eines Moduls)
  app.post('/api/lessons/:id/checkin', requireAuth, asyncRoute(async (req, res) => {
    const lesson = await pool.query(
      `SELECT id FROM lessons WHERE id = $1 AND module_code IS NOT NULL AND date <= ${ZURICH_TODAY}`,
      [req.params.id]
    );
    if (!lesson.rows[0]) return res.status(400).json({ error: 'Check-in ist erst am Tag der Lektion möglich.' });
    const removed = await pool.query(
      'DELETE FROM attendance WHERE lesson_id = $1 AND user_id = $2 RETURNING lesson_id',
      [req.params.id, req.user.id]
    );
    if (removed.rows.length === 0) {
      await pool.query('INSERT INTO attendance (lesson_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    }
    res.json({ attended: removed.rows.length === 0 });
  }));

  // Alle vergangenen Lektionen des Schuljahres als anwesend bestätigen
  app.post('/api/attendance/bulk', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    const result = await pool.query(
      `INSERT INTO attendance (lesson_id, user_id)
       SELECT l.id, $2 FROM lessons l
       WHERE l.school_year_id = $1 AND l.module_code IS NOT NULL AND l.date <= ${ZURICH_TODAY}
       ON CONFLICT DO NOTHING`,
      [year.id, req.user.id]
    );
    res.json({ added: result.rowCount });
  }));

  app.post('/api/lessons', requireAuth, requireManager, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    const parsed = lessonValues(req.body, await knownModules());
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await pool.query(
      `INSERT INTO lessons (school_year_id, date, start_time, end_time, lektionen, module_code, title, dozent, room, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [year.id, ...parsed.values]
    );
    res.status(201).json({ success: true });
  }));

  app.put('/api/lessons/:id', requireAuth, requireManager, asyncRoute(async (req, res) => {
    const parsed = lessonValues(req.body, await knownModules());
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await pool.query(
      `UPDATE lessons SET date = $2, start_time = $3, end_time = $4, lektionen = $5, module_code = $6,
              title = $7, dozent = $8, room = $9, note = $10
       WHERE id = $1`,
      [req.params.id, ...parsed.values]
    );
    res.json({ success: true });
  }));

  app.delete('/api/lessons/:id', requireAuth, requireManager, asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM lessons WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // Zeilen direkt aus dem Excel-Stundenplan einfügen (Spalten A–G)
  app.post('/api/lessons/import', requireAuth, requireManager, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    const { rows, errors } = parseLessonLines(req.body.text);
    const modules = await knownModules();
    if (req.body.replace === true) {
      await pool.query('DELETE FROM lessons WHERE school_year_id = $1', [year.id]);
    }
    for (const row of rows) {
      const isModule = row.module && modules.has(row.module);
      await pool.query(
        `INSERT INTO lessons (school_year_id, date, start_time, end_time, lektionen, module_code, title, dozent, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [year.id, row.date, row.start, row.end, row.lektionen, isModule ? row.module : null,
          isModule ? null : row.module, row.dozent, row.note]
      );
    }
    await audit(req, 'lessons_imported', `year:${year.id}`, { count: rows.length, replace: req.body.replace === true });
    res.json({ imported: rows.length, errors });
  }));

  // Kalender-Abo (Outlook / Teams / Google / Apple) über persönlichen Token
  app.get('/calendar/:token.ics', asyncRoute(async (req, res) => {
    const userRes = await pool.query(
      `SELECT u.id FROM users u JOIN participants p ON p.email = u.email AND p.active
       WHERE u.calendar_token = $1 AND u.email_verified`,
      [req.params.token]
    );
    if (!userRes.rows[0]) return res.status(404).send('Kalender nicht gefunden');

    const lessons = await pool.query(
      `SELECT l.id, to_char(l.date, 'YYYY-MM-DD') AS date, to_char(l.start_time, 'HH24:MI') AS start,
              to_char(l.end_time, 'HH24:MI') AS end, l.module_code, l.title, l.dozent, l.room, l.note,
              m.name AS module_name
       FROM lessons l LEFT JOIN modules m ON m.code = l.module_code
       WHERE l.date >= CURRENT_DATE - 60 AND COALESCE(l.title, '') <> 'Reserve'`
    );
    const tasks = await pool.query(
      `SELECT t.id, t.title, t.kind, t.due_at, t.module_code FROM tasks t
       WHERE t.due_at IS NOT NULL AND t.due_at >= NOW() - INTERVAL '60 days'`
    );
    const events = [
      ...lessons.rows.map((l) => ({
        uid: `lesson-${l.id}@hub-042`,
        summary: l.module_code ? `${l.module_code} · ${l.module_name}` : l.title,
        description: [l.dozent, l.note].filter(Boolean).join(' – '),
        location: l.room,
        date: l.date,
        start: l.start,
        end: l.end,
      })),
      ...tasks.rows.map((t) => ({
        uid: `task-${t.id}@hub-042`,
        summary: `⏰ ${t.kind}: ${t.title}`,
        description: t.module_code ? `Modul ${t.module_code}` : '',
        dueAt: t.due_at,
      })),
    ];
    res.type('text/calendar; charset=utf-8').send(buildCalendar('HUB-042 · HFWI-2504-AA', events));
  }));
};

module.exports.parseLessonLines = parseLessonLines;
module.exports.parseDate = parseDate;
