/**
 * Anonymes Ranking pro Schuljahr.
 * Eingabe: eine Zeile pro Abgabe mit { user_id, grade, percent }.
 * Ausgabe: sortierte Liste; nur die eigene Zeile trägt einen Namen,
 * alle anderen bleiben anonym und enthalten keine User-ID.
 */
function buildRanking(rows, currentUserId, currentUserName = 'Du') {
  const byUser = new Map();
  for (const row of rows) {
    if (row.grade === null || row.grade === undefined) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { grades: [], percents: [] });
    const bucket = byUser.get(row.user_id);
    bucket.grades.push(Number(row.grade));
    bucket.percents.push(Number(row.percent));
  }

  const avg = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
  const entries = Array.from(byUser.entries()).map(([userId, bucket]) => ({
    userId,
    avgGrade: Number(avg(bucket.grades).toFixed(2)),
    avgPercent: Number(avg(bucket.percents).toFixed(1)),
    count: bucket.grades.length,
  }));

  entries.sort((a, b) => b.avgGrade - a.avgGrade || b.avgPercent - a.avgPercent || b.count - a.count);

  // Gleicher Schnitt = gleicher Rang (1, 2, 2, 4)
  let lastKey = null;
  let lastRank = 0;
  return entries.map((entry, idx) => {
    const key = `${entry.avgGrade}|${entry.avgPercent}`;
    const rank = key === lastKey ? lastRank : idx + 1;
    lastKey = key;
    lastRank = rank;
    const isMe = entry.userId === currentUserId;
    return {
      rank,
      isMe,
      name: isMe ? currentUserName : 'Anonym',
      avgGrade: entry.avgGrade,
      avgPercent: entry.avgPercent,
      count: entry.count,
    };
  });
}

/**
 * Mindestanzahl Personen, ab der andere (anonym) angezeigt werden. Darunter
 * liesse sich der Schnitt einer bestimmten Person zurückrechnen (k-Anonymität).
 */
const MIN_GROUP_SIZE = 3;

/** Bei zu kleinen Gruppen nur die eigene Zeile zurückgeben. */
function protectSmallGroups(ranking, minSize = MIN_GROUP_SIZE) {
  if (ranking.length >= minSize) return { ranking, hidden: false };
  // Auch der eigene Rang würde verraten, wie die anderen stehen
  return { ranking: ranking.filter((r) => r.isMe).map((r) => ({ ...r, rank: null })), hidden: ranking.length > 0 };
}

function rankingSummary(ranking) {
  const me = ranking.find((r) => r.isMe) || null;
  const total = ranking.length;
  const classAvg = total
    ? Number((ranking.reduce((sum, r) => sum + r.avgGrade, 0) / total).toFixed(2))
    : null;
  let betterThan = null;
  if (me && total > 1) {
    const below = ranking.filter((r) => r.avgGrade < me.avgGrade).length;
    betterThan = Math.round((below / (total - 1)) * 100);
  }
  return { me, total, classAvg, betterThan };
}

module.exports = {
  buildRanking, rankingSummary, protectSmallGroups, MIN_GROUP_SIZE,
};
