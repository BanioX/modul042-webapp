/**
 * Lernleistungspunkte (LLP) nach HKV-Leistungsausweis:
 *   Modul-LLP möglich = Präsenz (0.5 LLP pro Lektion) + Maximalpunkte aller ATL/Mastery Tests
 *   Modulnote         = erreicht / möglich × 5 + 1 (gerundet auf 0.1)
 * Über alle drei Studienjahre sind maximal 3600 LLP möglich.
 */
const { calculateSwissGrade } = require('./grades');

const LLP_PER_LEKTION = 0.5;
const LLP_TOTAL_PROGRAM = 3600;
const EXAM_GROUP = 'JP';

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * lessons:  [{ id, module_code, lektionen, date }]
 * attended: Set von Lektions-IDs mit Check-in
 * tasks:    [{ module_code, kind, max_points, points (eigene oder null), submitted }]
 * today:    'YYYY-MM-DD'
 */
function computeLlp({
  modules, lessons, attended, tasks, today,
}) {
  const rows = new Map();
  const row = (code, name) => {
    if (!rows.has(code)) {
      rows.set(code, {
        code,
        name,
        presencePossible: 0,
        presencePast: 0,
        presenceEarned: 0,
        tasksPossible: 0,
        tasksGradedPossible: 0,
        tasksEarned: 0,
        openTasks: 0,
      });
    }
    return rows.get(code);
  };
  modules.forEach((m) => row(m.code, m.name));

  for (const lesson of lessons) {
    if (!lesson.module_code || !rows.has(lesson.module_code)) continue;
    const llp = (lesson.lektionen || 0) * LLP_PER_LEKTION;
    const r = rows.get(lesson.module_code);
    r.presencePossible += llp;
    if (lesson.date <= today) r.presencePast += llp;
    if (attended.has(lesson.id)) r.presenceEarned += llp;
  }

  for (const task of tasks) {
    if (task.max_points === null || task.max_points === undefined) continue;
    const isExam = !task.module_code && task.kind === 'Jahresprüfung';
    if (!task.module_code && !isExam) continue;
    const r = isExam ? row(EXAM_GROUP, 'Jahresprüfung') : row(task.module_code, task.module_code);
    const max = Number(task.max_points);
    r.tasksPossible += max;
    if (task.points !== null && task.points !== undefined) {
      r.tasksGradedPossible += max;
      r.tasksEarned += Number(task.points);
    } else {
      r.openTasks += 1;
    }
  }

  const list = Array.from(rows.values())
    .filter((r) => r.presencePossible > 0 || r.tasksPossible > 0)
    .map((r) => {
      const possible = round1(r.presencePossible + r.tasksPossible);
      const earned = round1(r.presenceEarned + r.tasksEarned);
      // Zwischenstand: nur was bisher stattgefunden hat bzw. bewertet ist
      const possibleSoFar = round1(r.presencePast + r.tasksGradedPossible);
      const complete = r.openTasks === 0 && r.presencePast >= r.presencePossible;
      return {
        code: r.code,
        name: r.name,
        possible,
        earned,
        possibleSoFar,
        presence: { possible: round1(r.presencePossible), earned: round1(r.presenceEarned), past: round1(r.presencePast) },
        tasks: { possible: round1(r.tasksPossible), earned: round1(r.tasksEarned), open: r.openTasks },
        grade: complete && possible > 0 ? calculateSwissGrade(earned, possible) : null,
        gradeSoFar: possibleSoFar > 0 ? calculateSwissGrade(earned, possibleSoFar) : null,
        complete,
      };
    });

  const sum = (key) => round1(list.reduce((acc, r) => acc + r[key], 0));
  const possible = sum('possible');
  const earned = sum('earned');
  return {
    modules: list,
    total: {
      possible,
      earned,
      possibleSoFar: sum('possibleSoFar'),
      percent: possible > 0 ? Math.round((earned / possible) * 100) : null,
    },
  };
}

module.exports = {
  LLP_PER_LEKTION, LLP_TOTAL_PROGRAM, EXAM_GROUP, computeLlp,
};
