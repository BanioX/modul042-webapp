const { buildRanking, rankingSummary, protectSmallGroups, MIN_GROUP_SIZE } = require('../ranking');
const { loadSubmissions, userProgress, xpTable } = require('../stats');
const { TASK_KINDS, FORUM_CATEGORIES } = require('../catalog');
const { canManage, PRIVACY_VERSION } = require('../access');
const { neededPointsTable } = require('../grades');
const { LLP_TOTAL_PROGRAM, loadLlp } = require('../llp');
const hkv = require('../data/hkv.json');
const { getMailStatus } = require('../mail');

module.exports = function hubRoutes(app, ctx) {
  const {
    pool, requireAuth, resolveYear, asyncRoute,
  } = ctx;

  app.get('/api/meta', requireAuth, asyncRoute(async (req, res) => {
    const years = await pool.query('SELECT * FROM school_years ORDER BY start_date');
    const current = await resolveYear(req);
    const modules = await pool.query(
      `SELECT code, name, lektionen, school_year_id, color, dozent
       FROM modules WHERE school_year_id IS NOT NULL ORDER BY name`
    );
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.display_name,
        role: req.user.role,
        canManage: canManage(req.user),
        needsConsent: req.user.consent_version !== PRIVACY_VERSION,
        mustChangePassword: Boolean(req.user.must_change_password),
        needsRecoveryId: !req.user.has_recovery,
      },
      mailEnabled: getMailStatus().configured,
      privacyVersion: PRIVACY_VERSION,
      years: years.rows,
      currentYearId: current ? current.id : null,
      modules: modules.rows,
      taskKinds: TASK_KINDS,
      forumCategories: FORUM_CATEGORIES,
    });
  }));

  app.get('/api/infos', requireAuth, (req, res) => {
    res.json({
      hfwi: hkv.hfwi, campus: hkv.campus, ferien: hkv.ferien, feiertage: hkv.feiertage, bachelor: hkv.bachelor, zertifikate: hkv.zertifikate,
    });
  });

  // Klassenliste für den Gruppengenerator: nur Namen, keine Mailadressen
  app.get('/api/groups/people', requireAuth, asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT COALESCE(u.display_name, p.full_name) AS name
       FROM participants p LEFT JOIN users u ON u.email = p.email
       WHERE p.active AND p.role <> 'dozent'
       ORDER BY 1`
    );
    res.json({ people: result.rows.map((r) => r.name) });
  }));

  app.get('/api/grades/needed', (req, res) => {
    res.json({ table: neededPointsTable(parseFloat(req.query.max) || 0) });
  });

  app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    if (!year) return res.json({ year: null });

    const progress = await userProgress(pool, req.user.id, year.id);
    const rankingRows = await loadSubmissions(pool, year.id, { rankingOnly: true });
    const ranking = buildRanking(rankingRows, req.user.id);
    const summary = rankingSummary(ranking);

    const nextLessons = await pool.query(
      `SELECT l.*, m.name AS module_name, m.color
       FROM lessons l LEFT JOIN modules m ON m.code = l.module_code
       WHERE l.date >= (NOW() AT TIME ZONE 'Europe/Zurich')::date
       ORDER BY l.date, l.start_time NULLS FIRST LIMIT 4`
    );
    const upcoming = await pool.query(
      `SELECT t.id, t.title, t.kind, t.due_at, t.max_points, t.module_code, m.name AS module_name, m.color
       FROM tasks t LEFT JOIN modules m ON m.code = t.module_code
       WHERE t.school_year_id = $1
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.task_id = t.id AND s.user_id = $2)
       ORDER BY t.due_at NULLS LAST LIMIT 5`,
      [year.id, req.user.id]
    );
    const nextExam = await pool.query(
      `SELECT t.id, t.title, t.kind, t.due_at, t.module_code FROM tasks t
       WHERE t.kind IN ('ATL', 'Mastery Test', 'Jahresprüfung') AND t.due_at > NOW()
       ORDER BY t.due_at LIMIT 1`
    );
    const threads = await pool.query(
      `SELECT t.id, t.title, t.category, t.last_activity_at, u.display_name AS author,
              (SELECT COUNT(*)::int FROM forum_posts p WHERE p.thread_id = t.id) AS replies
       FROM forum_threads t LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.last_activity_at DESC LIMIT 4`
    );

    res.json({
      year,
      progress,
      rank: summary.me && summary.total >= MIN_GROUP_SIZE
        ? { rank: summary.me.rank, total: summary.total, betterThan: summary.betterThan } : null,
      classSize: summary.total,
      nextLessons: nextLessons.rows,
      upcoming: upcoming.rows,
      nextExam: nextExam.rows[0] || null,
      threads: threads.rows,
    });
  }));

  const llpForYear = (userId, year) => loadLlp(pool, userId, year);

  // Leistungsausweis: LLP pro Modul im Schuljahr + Fortschritt über den ganzen Bildungsgang
  app.get('/api/llp', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    if (!year) return res.json({ year: null });
    const years = await pool.query('SELECT * FROM school_years ORDER BY start_date');
    const perYear = [];
    for (const y of years.rows) {
      const result = await llpForYear(req.user.id, y);
      perYear.push({ id: y.id, label: y.label, ...result.total });
    }
    const current = await llpForYear(req.user.id, year);
    const earnedProgram = perYear.reduce((sum, y) => sum + y.earned, 0);
    res.json({
      year,
      ...current,
      program: {
        max: LLP_TOTAL_PROGRAM,
        earned: Math.round(earnedProgram * 10) / 10,
        years: perYear,
      },
    });
  }));

  app.get('/api/ranking', requireAuth, asyncRoute(async (req, res) => {
    const year = await resolveYear(req);
    if (!year) return res.json({ ranking: [] });
    const mode = req.query.mode === 'xp' ? 'xp' : 'noten';
    const moduleCode = req.query.module && req.query.module !== 'ALL' ? String(req.query.module) : null;
    const myName = req.user.display_name;

    if (mode === 'xp') {
      const table = (await xpTable(pool, year.id)).filter((r) => r.xp > 0);
      table.sort((a, b) => b.xp - a.xp);
      let lastXp = null;
      let lastRank = 0;
      const ranking = table.map((row, idx) => {
        const rank = row.xp === lastXp ? lastRank : idx + 1;
        lastXp = row.xp;
        lastRank = rank;
        const isMe = row.user_id === req.user.id;
        return {
          rank, isMe, name: isMe ? myName : 'Anonym', xp: row.xp,
        };
      });
      const me = ranking.find((r) => r.isMe) || null;
      const safe = protectSmallGroups(ranking);
      return res.json({
        mode, year, ranking: safe.ranking, hidden: safe.hidden, minGroup: MIN_GROUP_SIZE, me: safe.hidden ? null : me, total: ranking.length,
      });
    }

    const rows = await loadSubmissions(pool, year.id, { moduleCode, rankingOnly: true });
    const ranking = buildRanking(rows, req.user.id, myName);
    const summary = rankingSummary(ranking);
    const safe = protectSmallGroups(ranking);
    return res.json({
      mode,
      year,
      module: moduleCode,
      ranking: safe.ranking,
      hidden: safe.hidden,
      minGroup: MIN_GROUP_SIZE,
      me: safe.hidden ? null : summary.me,
      total: summary.total,
      classAvg: safe.hidden ? null : summary.classAvg,
      betterThan: safe.hidden ? null : summary.betterThan,
      isStudent: req.user.role === 'student',
    });
  }));
};
