/** XP, Level und Abzeichen. Reine Funktionen, damit sie ohne DB testbar sind. */
const XP_PER_LEVEL = 100;
const XP = {
  submission: 20,
  onTime: 10,
  gradeFive: 10,
  gradeSix: 20,
  thread: 10,
  reply: 5,
  likeReceived: 2,
};

function computeXp({ submissions = [], threads = 0, replies = 0, likesReceived = 0 }) {
  let xp = 0;
  for (const sub of submissions) {
    xp += XP.submission;
    if (sub.onTime) xp += XP.onTime;
    if (sub.grade !== null && sub.grade !== undefined) {
      if (sub.grade >= 6) xp += XP.gradeSix;
      else if (sub.grade >= 5) xp += XP.gradeFive;
    }
  }
  xp += threads * XP.thread + replies * XP.reply + likesReceived * XP.likeReceived;
  return xp;
}

function levelFor(xp) {
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const current = safe % XP_PER_LEVEL;
  return {
    level,
    xp: safe,
    current,
    needed: XP_PER_LEVEL - current,
    progress: Math.round((current / XP_PER_LEVEL) * 100),
  };
}

const LEVEL_TITLES = ['Erstsemester', 'Lernende*r', 'Durchstarter*in', 'Profi', 'Expert*in', 'Legende'];
function levelTitle(level) {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))];
}

/** Aufeinanderfolgende Tage mit Aktivität bis heute (oder gestern). days: 'YYYY-MM-DD'-Strings. */
function computeStreak(days, today = new Date()) {
  const set = new Set(days);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const key = (d) => d.toISOString().slice(0, 10);
  if (!set.has(key(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(key(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function computeBadges({ submissions = [], threads = 0, replies = 0, likesReceived = 0, openTasks = 0, streak = 0 }) {
  const onTime = submissions.filter((s) => s.onTime).length;
  const graded = submissions.filter((s) => s.grade !== null && s.grade !== undefined);
  const badges = [
    { id: 'first', icon: '🚀', name: 'Erste Abgabe', desc: 'Erste Aufgabe erledigt', earned: submissions.length >= 1 },
    { id: 'punctual', icon: '⏰', name: 'Pünktlich', desc: '5 Aufgaben vor der Frist erledigt', earned: onTime >= 5 },
    { id: 'six', icon: '🏆', name: 'Glatte 6', desc: 'Eine Note 6.0 erreicht', earned: graded.some((s) => s.grade >= 6) },
    { id: 'solid', icon: '📈', name: 'Konstant', desc: '5 Noten ab 5.0', earned: graded.filter((s) => s.grade >= 5).length >= 5 },
    { id: 'helper', icon: '🤝', name: 'Helfer*in', desc: '5 Antworten im Forum', earned: replies >= 5 },
    { id: 'author', icon: '✍️', name: 'Wissensquelle', desc: '3 Beiträge im Forum erstellt', earned: threads >= 3 },
    { id: 'liked', icon: '💚', name: 'Hilfreich', desc: '10 Likes erhalten', earned: likesReceived >= 10 },
    { id: 'streak', icon: '🔥', name: 'Dranbleiben', desc: '7 Tage in Folge aktiv', earned: streak >= 7 },
    { id: 'clean', icon: '✅', name: 'Alles erledigt', desc: 'Keine offenen Aufgaben', earned: submissions.length > 0 && openTasks === 0 },
  ];
  return badges;
}

module.exports = {
  XP,
  XP_PER_LEVEL,
  computeXp,
  levelFor,
  levelTitle,
  computeStreak,
  computeBadges,
};
