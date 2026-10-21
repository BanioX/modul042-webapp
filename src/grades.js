/** Swiss grade: note = punkte / max * 5 + 1, rounded to GRADE_ROUNDING_STEP. */
const GRADE_ROUNDING_STEP = 0.1;
const TARGET_GRADES = [4.0, 5.0, 5.5, 6.0];

function roundGrade(value) {
  const step = GRADE_ROUNDING_STEP;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(1));
}

function calculateSwissGrade(points, maxPoints = 100) {
  const pts = parseFloat(points);
  const max = parseFloat(maxPoints);
  if (!max || max <= 0 || Number.isNaN(pts)) return 1.0;
  const grade = (pts / max) * 5 + 1;
  const clamped = Math.max(1.0, Math.min(6.0, grade));
  return roundGrade(clamped);
}

function pointsNeededForGrade(targetGrade, maxPoints) {
  const max = parseFloat(maxPoints);
  const target = parseFloat(targetGrade);
  if (!max || max <= 0 || Number.isNaN(target)) return null;
  const needed = ((target - 1) / 5) * max;
  return Number(Math.max(0, needed).toFixed(1));
}

function neededPointsTable(maxPoints) {
  return TARGET_GRADES.map((grade) => ({
    grade,
    points: pointsNeededForGrade(grade, maxPoints),
  }));
}

module.exports = {
  GRADE_ROUNDING_STEP,
  TARGET_GRADES,
  roundGrade,
  calculateSwissGrade,
  pointsNeededForGrade,
  neededPointsTable,
};
