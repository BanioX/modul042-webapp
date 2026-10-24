const { FORUM_CATEGORIES } = require('../catalog');
const { canManage } = require('../access');

module.exports = function forumRoutes(app, ctx) {
  const {
    pool, requireAuth, resolveYear, asyncRoute,
  } = ctx;

  async function loadThread(id) {
    const res = await pool.query('SELECT * FROM forum_threads WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  app.get('/api/forum', requireAuth, asyncRoute(async (req, res) => {
    const params = [req.user.id];
    const where = [];
    if (req.query.category && FORUM_CATEGORIES.includes(req.query.category)) {
      params.push(req.query.category);
      where.push(`t.category = $${params.length}`);
    }
    if (req.query.module) {
      params.push(req.query.module);
      where.push(`t.module_code = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).slice(0, 100)}%`);
      where.push(`(t.title ILIKE $${params.length} OR t.body ILIKE $${params.length})`);
    }
    const result = await pool.query(
      `SELECT t.id, t.title, t.category, t.module_code, t.pinned, t.solved, t.created_at, t.last_activity_at,
              LEFT(t.body, 220) AS excerpt, u.display_name AS author, u.role AS author_role,
              (SELECT COUNT(*)::int FROM forum_posts p WHERE p.thread_id = t.id) AS replies,
              (SELECT COUNT(*)::int FROM forum_likes l WHERE l.thread_id = t.id) AS likes,
              EXISTS (SELECT 1 FROM forum_likes l WHERE l.thread_id = t.id AND l.user_id = $1) AS liked
       FROM forum_threads t LEFT JOIN users u ON u.id = t.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.pinned DESC, t.last_activity_at DESC
       LIMIT 100`,
      params
    );
    res.json({ threads: result.rows, categories: FORUM_CATEGORIES });
  }));

  app.post('/api/forum', requireAuth, asyncRoute(async (req, res) => {
    const title = String(req.body.title || '').trim().slice(0, 200);
    const body = String(req.body.body || '').trim().slice(0, 10000);
    if (!title || !body) return res.status(400).json({ error: 'Titel und Text sind nötig.' });
    const category = FORUM_CATEGORIES.includes(req.body.category) ? req.body.category : 'Fragen';
    const year = await resolveYear(req);
    const result = await pool.query(
      `INSERT INTO forum_threads (school_year_id, module_code, category, title, body, user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [year ? year.id : null, req.body.module_code || null, category, title, body, req.user.id]
    );
    res.status(201).json({ id: result.rows[0].id });
  }));

  app.get('/api/forum/:id', requireAuth, asyncRoute(async (req, res) => {
    const thread = await pool.query(
      `SELECT t.*, u.display_name AS author, u.role AS author_role,
              (SELECT COUNT(*)::int FROM forum_likes l WHERE l.thread_id = t.id) AS likes,
              EXISTS (SELECT 1 FROM forum_likes l WHERE l.thread_id = t.id AND l.user_id = $2) AS liked
       FROM forum_threads t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
      [req.params.id, req.user.id]
    );
    if (!thread.rows[0]) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    const posts = await pool.query(
      `SELECT p.id, p.body, p.created_at, p.user_id, u.display_name AS author, u.role AS author_role
       FROM forum_posts p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.thread_id = $1 ORDER BY p.created_at`,
      [req.params.id]
    );
    const manage = canManage(req.user);
    const t = thread.rows[0];
    res.json({
      thread: { ...t, canEdit: manage || t.user_id === req.user.id, user_id: undefined },
      posts: posts.rows.map((p) => ({ ...p, canEdit: manage || p.user_id === req.user.id, user_id: undefined })),
      canPin: manage,
    });
  }));

  app.post('/api/forum/:id/posts', requireAuth, asyncRoute(async (req, res) => {
    const body = String(req.body.body || '').trim().slice(0, 10000);
    if (!body) return res.status(400).json({ error: 'Antwort ist leer.' });
    const thread = await loadThread(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    await pool.query('INSERT INTO forum_posts (thread_id, user_id, body) VALUES ($1, $2, $3)', [thread.id, req.user.id, body]);
    await pool.query('UPDATE forum_threads SET last_activity_at = NOW() WHERE id = $1', [thread.id]);
    res.status(201).json({ success: true });
  }));

  app.post('/api/forum/:id/like', requireAuth, asyncRoute(async (req, res) => {
    const removed = await pool.query(
      'DELETE FROM forum_likes WHERE thread_id = $1 AND user_id = $2 RETURNING thread_id',
      [req.params.id, req.user.id]
    );
    if (removed.rows.length === 0) {
      await pool.query(
        'INSERT INTO forum_likes (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, req.user.id]
      );
    }
    res.json({ liked: removed.rows.length === 0 });
  }));

  app.patch('/api/forum/:id', requireAuth, asyncRoute(async (req, res) => {
    const thread = await loadThread(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    const manage = canManage(req.user);
    if (!manage && thread.user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung.' });
    if (typeof req.body.solved === 'boolean') {
      await pool.query('UPDATE forum_threads SET solved = $2 WHERE id = $1', [thread.id, req.body.solved]);
    }
    if (typeof req.body.pinned === 'boolean' && manage) {
      await pool.query('UPDATE forum_threads SET pinned = $2 WHERE id = $1', [thread.id, req.body.pinned]);
    }
    res.json({ success: true });
  }));

  app.delete('/api/forum/:id', requireAuth, asyncRoute(async (req, res) => {
    const thread = await loadThread(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
    if (!canManage(req.user) && thread.user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung.' });
    await pool.query('DELETE FROM forum_threads WHERE id = $1', [thread.id]);
    res.json({ success: true });
  }));

  app.delete('/api/forum/posts/:postId', requireAuth, asyncRoute(async (req, res) => {
    const post = await pool.query('SELECT * FROM forum_posts WHERE id = $1', [req.params.postId]);
    if (!post.rows[0]) return res.status(404).json({ error: 'Antwort nicht gefunden.' });
    if (!canManage(req.user) && post.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung.' });
    await pool.query('DELETE FROM forum_posts WHERE id = $1', [req.params.postId]);
    res.json({ success: true });
  }));
};
