const { EphemeralChat, GROUP } = require('../chat');

module.exports = function chatRoutes(app, ctx) {
  const {
    pool, chat, requireAuth, asyncRoute,
  } = ctx;

  const me = (req) => {
    chat.touch(req.user.id, req.user.display_name);
    return req.user.id;
  };
  const guarded = (fn) => asyncRoute(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (/Chat|leer|Person|Zugriff/.test(err.message)) return res.status(400).json({ error: err.message });
      throw err;
    }
    return undefined;
  });

  // Lebenszeichen von jeder Seite, damit die Chat-Sitzung bestehen bleibt
  app.post('/api/chat/ping', requireAuth, (req, res) => {
    me(req);
    res.json({ ok: true });
  });

  app.get('/api/chat', requireAuth, (req, res) => {
    const id = me(req);
    res.json({ me: id, group: GROUP, ...chat.view(id) });
  });

  app.post('/api/chat/send', requireAuth, guarded(async (req, res) => {
    const id = me(req);
    res.json({ message: chat.send(id, String(req.body.room || ''), req.body.text) });
  }));

  app.post('/api/chat/dm', requireAuth, guarded(async (req, res) => {
    const id = me(req);
    const target = parseInt(req.body.userId, 10);
    if (!target || target === id) return res.status(400).json({ error: 'Ungültige Person.' });
    const exists = await pool.query(
      `SELECT 1 FROM users u JOIN participants p ON p.email = u.email AND p.active
       WHERE u.id = $1 AND u.email_verified`,
      [target]
    );
    if (!exists.rows[0]) return res.status(404).json({ error: 'Person nicht gefunden.' });
    const room = EphemeralChat.dmId(id, target);
    chat.join(id, room);
    return res.json({ room });
  }));

  app.post('/api/chat/join', requireAuth, guarded(async (req, res) => {
    const id = me(req);
    chat.join(id, String(req.body.room || ''));
    res.json({ ok: true });
  }));

  app.post('/api/chat/invite', requireAuth, guarded(async (req, res) => {
    const id = me(req);
    chat.invite(id, parseInt(req.body.userId, 10), String(req.body.room || ''));
    res.json({ ok: true });
  }));
};
