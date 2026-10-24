const { calculateSwissGrade, neededPointsTable } = require('../grades');
const { TASK_KINDS } = require('../catalog');

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function taskStatus(task, submission, now = new Date()) {
  if (submission) return 'erledigt';
  if (task.due_at && new Date(task.due_at) < now) return 'überfällig';
  return 'offen';
}

module.exports = function taskRoutes(app, ctx) {
  const {
    pool, requireAuth, requireManager, resolveYear, asyncRoute, audit,
  } = ctx;

  function readTaskBody(body) {
    const title = String(body.title || '').trim().slice(0, 200);
    const kind = TASK_KINDS.includes(body.kind) ? body.kind : 'Auftrag';
    const maxPoints = num(body.max_points);
    const dueAt = body.due_at ? new Date(body.due_at) : null;
    if (!title) return { error: 'Titel fehlt.' };
    if (Number.isNaN(maxPoints) || (maxPoints !== null && maxPoints <= 0)) return { error: 'Maximalpunkte müssen grösser als 0 sein.' };
    if (dueAt && Number.isNaN(dueAt.getTime())) return { error: 'Ungültiges Fälligkeitsdatum.' };
    return {
      title,
      kind,
      maxPoints,
      dueAt,
      description: String(body.description || '').slice(0, 5000),
      moduleCode: body.module_code || null,
      counts: body.counts_for_ranking !== false,
    };
  }

  app.get('/api/tasks', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    if (!year) return res.json({ tasks: [] });
    const result = await pool.query(
      `SELECT t.*, m.name AS module_name, m.color,
              s.id AS sub_id, s.points AS sub_points, s.max_points AS sub_max, s.note AS sub_note,
              s.submitted_at AS sub_submitted_at,
              (SELECT COUNT(*)::int FROM submissions x JOIN users xu ON xu.id = x.user_id
                WHERE x.task_id = t.id AND xu.role <> 'dozent') AS done_count
       FROM tasks t
       LEFT JOIN modules m ON m.code = t.module_code
       LEFT JOIN submissions s ON s.task_id = t.id AND s.user_id = $2
       WHERE t.school_year_id = $1
       ORDER BY t.due_at NULLS LAST, t.id`,
      [year.id, req.user.id]
    );
    const students = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role <> 'dozent' AND email_verified");
    const tasks = result.rows.map((row) => {
      const submission = row.sub_id ? {
        points: row.sub_points === null ? null : Number(row.sub_points),
        max_points: row.max_points !== null ? Number(row.max_points) : (row.sub_max === null ? null : Number(row.sub_max)),
        note: row.sub_note,
        submitted_at: row.sub_submitted_at,
      } : null;
      if (submission && submission.points !== null && submission.max_points) {
        submission.grade = calculateSwissGrade(submission.points, submission.max_points);
      }
      return {
        id: row.id,
        school_year_id: row.school_year_id,
        module_code: row.module_code,
        module_name: row.module_name,
        color: row.color,
        title: row.title,
        description: row.description,
        kind: row.kind,
        max_points: row.max_points === null ? null : Number(row.max_points),
        due_at: row.due_at,
        counts_for_ranking: row.counts_for_ranking,
        status: taskStatus(row, submission),
        submission,
        done_count: row.done_count,
        needed: row.max_points ? neededPointsTable(Number(row.max_points)) : null,
      };
    });
    res.json({ year, tasks, students: students.rows[0].n });
  }));

  app.post('/api/tasks', requireAuth, requireManager, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    const t = readTaskBody(req.body);
    if (t.error) return res.status(400).json({ error: t.error });
    const result = await pool.query(
      `INSERT INTO tasks (school_year_id, module_code, title, description, kind, max_points, due_at, counts_for_ranking, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [year.id, t.moduleCode, t.title, t.description, t.kind, t.maxPoints, t.dueAt, t.counts, req.user.id]
    );
    await audit(req, 'task_created', `task:${result.rows[0].id}`, { title: t.title });
    res.status(201).json({ id: result.rows[0].id });
  }));

  app.put('/api/tasks/:id', requireAuth, requireManager, asyncRoute(async (req, res) => {
    const t = readTaskBody(req.body);
    if (t.error) return res.status(400).json({ error: t.error });
    await pool.query(
      `UPDATE tasks SET module_code = $2, title = $3, description = $4, kind = $5, max_points = $6,
              due_at = $7, counts_for_ranking = $8
       WHERE id = $1`,
      [req.params.id, t.moduleCode, t.title, t.description, t.kind, t.maxPoints, t.dueAt, t.counts]
    );
    await audit(req, 'task_updated', `task:${req.params.id}`, { title: t.title });
    res.json({ success: true });
  }));

  app.delete('/api/tasks/:id', requireAuth, requireManager, asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    await audit(req, 'task_deleted', `task:${req.params.id}`);
    res.json({ success: true });
  }));

  // Eigene Punkte eintragen, z. B. 45 / 60 (wie "Abgeben" in MS Teams)
  app.put('/api/tasks/:id/submission', requireAuth, asyncRoute(async (req, res) => {
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const task = taskRes.rows[0];
    if (!task) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });

    const points = num(req.body.points);
    const ownMax = task.max_points === null ? num(req.body.max_points) : null;
    const max = task.max_points !== null ? Number(task.max_points) : ownMax;
    if (Number.isNaN(points) || Number.isNaN(ownMax)) return res.status(400).json({ error: 'Bitte Zahlen eingeben.' });
    if (points !== null) {
      if (points < 0) return res.status(400).json({ error: 'Punkte können nicht negativ sein.' });
      if (!max || max <= 0) return res.status(400).json({ error: 'Bitte auch die Maximalpunkte angeben (z. B. 45 / 60).' });
      if (points > max) return res.status(400).json({ error: `Mehr als ${max} Punkte sind nicht möglich.` });
    }
    const note = String(req.body.note || '').slice(0, 1000);
    await pool.query(
      `INSERT INTO submissions (task_id, user_id, points, max_points, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (task_id, user_id) DO UPDATE
         SET points = EXCLUDED.points, max_points = EXCLUDED.max_points,
             note = EXCLUDED.note, updated_at = NOW()`,
      [task.id, req.user.id, points, ownMax, note]
    );
    res.json({
      success: true,
      grade: points !== null && max ? calculateSwissGrade(points, max) : null,
    });
  }));

  app.delete('/api/tasks/:id/submission', requireAuth, asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM submissions WHERE task_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  }));
};

module.exports.taskStatus = taskStatus;
