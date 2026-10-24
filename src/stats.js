const { calculateSwissGrade } = require('./grades');
const {
  computeXp, levelFor, levelTitle, computeStreak, computeBadges,
} = require('./gamification');

/** Abgaben eines Schuljahres mit Note und Pünktlichkeit; userId optional. */
async function loadSubmissions(pool, yearId, { userId = null, moduleCode = null, rankingOnly = false } = {}) {
  const params = [yearId];
  const where = ['t.school_year_id = $1'];
  if (userId) {
    params.push(userId);
    where.push(`s.user_id = $${params.length}`);
  }
  if (moduleCode) {
    params.push(moduleCode);
    where.push(`t.module_code = $${params.length}`);
  }
  if (rankingOnly) where.push('t.counts_for_ranking = true');

  const res = await pool.query(
    `SELECT s.user_id, s.points, COALESCE(t.max_points, s.max_points) AS max_points,
            s.submitted_at, t.due_at
     FROM submissions s
     JOIN tasks t ON t.id = s.task_id
     JOIN users u ON u.id = s.user_id
     WHERE ${where.join(' AND ')} AND u.role <> 'dozent'`,
    params
  );
  return res.rows.map(toScored);
}

function toScored(row) {
  const points = row.points === null ? null : Number(row.points);
  const max = row.max_points === null ? null : Number(row.max_points);
  const graded = points !== null && max !== null && max > 0;
  return {
    user_id: row.user_id,
    grade: graded ? calculateSwissGrade(points, max) : null,
    percent: graded ? Number(((points / max) * 100).toFixed(1)) : null,
    onTime: !row.due_at || new Date(row.submitted_at) <= new Date(row.due_at),
  };
}

/** Forum-Aktivität pro User im Schuljahr: { [userId]: { threads, replies, likesReceived } } */
async function loadForumActivity(pool, yearId, userId = null) {
  const params = [yearId];
  const userFilter = userId ? (params.push(userId), `AND user_id = $${params.length}`) : '';
  const threads = await pool.query(
    `SELECT user_id, COUNT(*)::int AS n FROM forum_threads
     WHERE school_year_id = $1 AND user_id IS NOT NULL ${userFilter} GROUP BY user_id`,
    params
  );
  const replies = await pool.query(
    `SELECT p.user_id, COUNT(*)::int AS n FROM forum_posts p
     JOIN forum_threads t ON t.id = p.thread_id
     WHERE t.school_year_id = $1 AND p.user_id IS NOT NULL ${userFilter.replace('user_id', 'p.user_id')}
     GROUP BY p.user_id`,
    params
  );
  const likes = await pool.query(
    `SELECT t.user_id, COUNT(*)::int AS n FROM forum_likes l
     JOIN forum_threads t ON t.id = l.thread_id
     WHERE t.school_year_id = $1 AND t.user_id IS NOT NULL AND l.user_id <> t.user_id
       ${userFilter.replace('user_id', 't.user_id')}
     GROUP BY t.user_id`,
    params
  );
  const out = {};
  const bucket = (id) => {
    if (!out[id]) out[id] = { threads: 0, replies: 0, likesReceived: 0 };
    return out[id];
  };
  threads.rows.forEach((r) => { bucket(r.user_id).threads = r.n; });
  replies.rows.forEach((r) => { bucket(r.user_id).replies = r.n; });
  likes.rows.forEach((r) => { bucket(r.user_id).likesReceived = r.n; });
  return out;
}

async function loadStreak(pool, userId) {
  const res = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM user_activity
     WHERE user_id = $1 AND day > CURRENT_DATE - 400`,
    [userId]
  );
  return computeStreak(res.rows.map((r) => r.day));
}

async function userProgress(pool, userId, yearId) {
  const submissions = await loadSubmissions(pool, yearId, { userId });
  const forum = (await loadForumActivity(pool, yearId, userId))[userId]
    || { threads: 0, replies: 0, likesReceived: 0 };
  const openRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks t
     WHERE t.school_year_id = $1
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.task_id = t.id AND s.user_id = $2)`,
    [yearId, userId]
  );
  const totalRes = await pool.query('SELECT COUNT(*)::int AS n FROM tasks WHERE school_year_id = $1', [yearId]);
  const streak = await loadStreak(pool, userId);
  const xp = computeXp({ submissions, ...forum });
  const level = levelFor(xp);
  const graded = submissions.filter((s) => s.grade !== null);
  return {
    xp,
    level: { ...level, title: levelTitle(level.level) },
    streak,
    tasksDone: submissions.length,
    tasksTotal: totalRes.rows[0].n,
    tasksOpen: openRes.rows[0].n,
    avgGrade: graded.length
      ? Number((graded.reduce((sum, s) => sum + s.grade, 0) / graded.length).toFixed(2))
      : null,
    forum,
    badges: computeBadges({ submissions, ...forum, openTasks: openRes.rows[0].n, streak }),
  };
}

/** XP aller Studierenden im Schuljahr (für das XP-Ranking). */
async function xpTable(pool, yearId) {
  const submissions = await loadSubmissions(pool, yearId);
  const forum = await loadForumActivity(pool, yearId);
  const students = await pool.query(
    "SELECT id FROM users WHERE role <> 'dozent' AND email_verified = true"
  );
  return students.rows.map(({ id }) => ({
    user_id: id,
    xp: computeXp({
      submissions: submissions.filter((s) => s.user_id === id),
      ...(forum[id] || {}),
    }),
  }));
}

module.exports = {
  loadSubmissions, loadForumActivity, userProgress, xpTable, toScored,
};
