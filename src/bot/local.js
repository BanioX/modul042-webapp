/**
 * Lokaler Hilfe-Bot ohne KI: erkennt typische Fragen und antwortet aus den Daten von HUB-042.
 * Eigene Werte (Schnitt, LLP) werden nur für die fragende Person gelesen und bleiben auf dem Server.
 */
const faq = require('../data/faq.json');
const hkv = require('../data/hkv.json');
const { calculateSwissGrade, pointsNeededForGrade } = require('../grades');
const { loadLlp } = require('../llp');

const TZ = 'Europe/Zurich';

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9.,/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(q, ...words) {
  return words.some((w) => q.includes(w));
}

function num(value) {
  return parseFloat(String(value).replace(',', '.'));
}

function fmtNum(n) {
  return Number(n).toLocaleString('de-CH', { maximumFractionDigits: 1 });
}

function fmtDate(value, withTime = false) {
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function fmtDay(isoDate) {
  return fmtDate(`${isoDate}T12:00:00Z`);
}

/** „45 von 60“, „45/60“, „45 aus 60 punkten“ → { points, max } */
function parseGradeQuestion(raw) {
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)\s*(?:von|\/|aus|of)\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const points = num(m[1]);
  const max = num(m[2]);
  if (!(max > 0) || points < 0 || points > max) return null;
  return { points, max };
}

/** „Wie viele Punkte brauche ich für eine 5 bei 60?“ → { grade, max } */
function parseNeededQuestion(raw) {
  const q = normalize(raw);
  if (!has(q, 'brauch', 'benoetig', 'fuer eine', 'fuer ein', 'reicht', 'muss ich')) return null;
  const g = q.match(/(?:note|eine|ein|fuer)\s+([1-6](?:[.,]\d+)?)(?!\d)/);
  const m = q.match(/(?:bei|von|max(?:imal)?|maximum|aus)\s+(\d+(?:[.,]\d+)?)/);
  if (!g || !m) return null;
  const grade = num(g[1]);
  const max = num(m[1]);
  if (grade < 1 || grade > 6 || !(max > 0)) return null;
  return { grade, max };
}

/** Stockwerk und Treppe gemäss Zimmerplan Pestalozzi-Schulhaus */
function roomHint(text) {
  const m = String(text || '').match(/(?:zimmer|raum)\s*([ue]?)(\d{2,3})/i);
  if (!m) return null;
  const room = `${m[1].toUpperCase()}${m[2]}`;
  if (m[1].toLowerCase() === 'u') return `Zimmer ${room} ist im Untergeschoss.`;
  if (m[1].toLowerCase() === 'e') return `Zimmer ${room} ist im Erdgeschoss.`;
  const n = parseInt(m[2], 10);
  if (n < 100) return null;
  const suffix = n % 100;
  const stair = suffix >= 26 && suffix <= 41 ? ', Treppe West' : (suffix >= 11 && suffix <= 22 ? ', Treppe Ost' : '');
  const extra = n === 224 ? ' Das ist die Aula.' : '';
  return `Zimmer ${room} ist im ${Math.floor(n / 100)}. Stock${stair} im Pestalozzischulhaus (Bahnhofstrasse 46).${extra}`;
}

/** Modul in der Frage finden: per Kürzel (APPL) oder einem markanten Wort im Namen (Datenschutz). */
function detectModule(raw, modules) {
  const q = normalize(raw);
  const words = new Set(q.split(/[\s,./-]+/));
  const byCode = modules.find((m) => words.has(m.code.toLowerCase()));
  if (byCode) return byCode;
  const stop = new Set(['management', 'und', 'engineering', 'modul', 'mastery', 'artificial', 'intelligence', 'business']);
  let best = null;
  for (const m of modules) {
    const parts = normalize(m.name).split(/[\s,./-]+/).filter((w) => w.length >= 5 && !stop.has(w));
    if (parts.some((w) => q.includes(w))) {
      if (!best || m.name.length < best.name.length) best = m;
    }
  }
  return best;
}

function faqMatch(raw) {
  const q = normalize(raw);
  let best = null;
  let bestScore = 0;
  for (const item of faq) {
    const score = item.keywords.filter((k) => q.includes(normalize(k))).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best ? best.answer : null;
}

const SUGGESTIONS = [
  'Wann ist die nächste Prüfung?',
  'Wann ist der nächste Unterricht?',
  'Wie viel ist 45 von 60?',
  'Was brauche ich für eine 5 bei 60 Punkten?',
  'Wie ist mein Notenschnitt?',
  'Wie viele LLP habe ich?',
  'Wann sind die nächsten Ferien?',
  'Was ist ITIL?',
  'Welche Bachelor gibt es nach dem HF?',
  'Wo ist Zimmer 126?',
];

function capabilities() {
  return 'Ich bin der Hilfe-Bot von HUB-042 und kann z. B.:\n'
    + '• Termine nennen: nächste Prüfung, nächster Unterricht, Ferien\n'
    + '• Noten rechnen: „45 von 60“ oder „was brauche ich für eine 5 bei 60“\n'
    + '• deinen Notenschnitt und deine LLP anzeigen\n'
    + '• Module, Zertifikate (IPMA, IREB, ITIL, COBIT, IELTS), Bachelor nach dem HF und Kontakte erklären\n'
    + '• Zimmer finden und die Bedienung von HUB-042 erklären';
}

async function currentYear(pool) {
  const res = await pool.query(
    `SELECT * FROM school_years
     ORDER BY ((NOW() AT TIME ZONE 'Europe/Zurich')::date BETWEEN start_date AND end_date) DESC, start_date DESC LIMIT 1`
  );
  return res.rows[0] || null;
}

/** Antwort auf eine Frage. Gibt { answer, suggestions? } zurück. */
async function localAnswer({ pool, user, question }) {
  const raw = String(question || '');
  const q = normalize(raw);
  const modules = (await pool.query('SELECT code, name, lektionen, school_year_id FROM modules WHERE school_year_id IS NOT NULL')).rows;

  // Name / Begrüssung / Hilfe
  if (has(q, 'warum heisst', 'name hub', 'hub-042', 'hub 042', ' 42', 'anhalter', 'douglas')) return { answer: faq[0].answer };
  if (/^(hallo|hoi|hi|hey|gruezi|guten tag|servus|salut)\b/.test(q) || has(q, 'was kannst du', 'hilfe', 'wie funktionierst')) {
    return { answer: `Hoi ${String(user.display_name || '').split(' ')[0]}! ${capabilities()}`, suggestions: SUGGESTIONS.slice(0, 5) };
  }
  if (has(q, 'danke', 'merci', 'thx')) return { answer: 'Gern geschehen! 🚀' };

  // Notenrechner
  const needed = parseNeededQuestion(raw);
  if (needed) {
    const pts = pointsNeededForGrade(needed.grade, needed.max);
    return { answer: `Für eine ${needed.grade.toFixed(1)} bei ${fmtNum(needed.max)} Punkten brauchst du mindestens ${fmtNum(pts)} Punkte (Note = Punkte × 5 ÷ Maximum + 1).` };
  }
  const calc = parseGradeQuestion(raw);
  if (calc) {
    const grade = calculateSwissGrade(calc.points, calc.max);
    const exact = (calc.points * 5) / calc.max + 1;
    return { answer: `${fmtNum(calc.points)} von ${fmtNum(calc.max)} Punkten ergibt eine ${grade.toFixed(1)} (genau ${exact.toFixed(2)}, gerundet auf 0.1).` };
  }

  // Zimmer
  const room = roomHint(raw);
  if (room) return { answer: room };

  const mod = detectModule(raw, modules);

  // Prüfungen und Fristen
  if (has(q, 'pruefung', 'frist', 'faellig', 'abgabe', 'atl', 'mastery', 'test', 'deadline', 'abgeben')) {
    const params = [user.id];
    let filter = '';
    if (mod) { params.push(mod.code); filter = `AND t.module_code = $${params.length}`; }
    if (has(q, 'jahrespruefung')) filter += " AND t.kind = 'Jahresprüfung'";
    const res = await pool.query(
      `SELECT t.title, t.kind, t.max_points, t.due_at, t.module_code, m.name AS module_name,
              EXISTS (SELECT 1 FROM submissions s WHERE s.task_id = t.id AND s.user_id = $1) AS done
       FROM tasks t LEFT JOIN modules m ON m.code = t.module_code
       WHERE t.due_at > NOW() ${filter}
       ORDER BY t.due_at LIMIT 4`,
      params
    );
    if (!res.rows.length) return { answer: `Ich finde keine kommenden Fristen${mod ? ` für ${mod.name}` : ''}. 🎉` };
    const lines = res.rows.map((t) => `• ${fmtDate(t.due_at, true)}: ${t.module_code ? `${t.module_name}, ` : ''}${t.title} (${t.kind}${t.max_points ? `, ${fmtNum(t.max_points)} Punkte` : ''})${t.done ? ' ✓ eingetragen' : ''}`);
    return { answer: `Die nächsten Fristen${mod ? ` für ${mod.name}` : ''}:\n${lines.join('\n')}\n\nDetails und Punkte eintragen im ATL-Tracker.` };
  }

  // Unterricht / Stundenplan
  if (has(q, 'unterricht', 'lektion', 'stundenplan', 'schule', 'wann ist', 'wann haben', 'naechste', 'morgen', 'mittwoch', 'samstag') || (mod && has(q, 'wann'))) {
    const params = [];
    let filter = '';
    if (mod) { params.push(mod.code); filter = `AND l.module_code = $${params.length}`; }
    const res = await pool.query(
      `SELECT to_char(l.date, 'YYYY-MM-DD') AS date, to_char(l.start_time, 'HH24:MI') AS s, to_char(l.end_time, 'HH24:MI') AS e,
              COALESCE(m.name, l.title) AS name, l.room, l.lektionen
       FROM lessons l LEFT JOIN modules m ON m.code = l.module_code
       WHERE l.date >= (NOW() AT TIME ZONE 'Europe/Zurich')::date ${filter} AND COALESCE(l.title, '') <> 'Reserve'
       ORDER BY l.date, l.start_time LIMIT 4`,
      params
    );
    if (!res.rows.length) return { answer: `Im Stundenplan steht nichts Kommendes${mod ? ` für ${mod.name}` : ''}.` };
    const lines = res.rows.map((l) => `• ${fmtDay(l.date)}${l.s ? `, ${l.s}–${l.e}` : ''}: ${l.name}${l.room ? ` (${l.room})` : ''}`);
    return { answer: `Nächster Unterricht${mod ? ` in ${mod.name}` : ''}:\n${lines.join('\n')}\n\nTipp: Im Stundenplan kannst du ihn als Kalender abonnieren.` };
  }

  // Ferien
  if (has(q, 'ferien', 'feiertag', 'frei ', 'unterrichtsfrei', 'urlaub')) {
    const today = new Date().toISOString().slice(0, 10);
    const next = hkv.ferien.filter((f) => f.end >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
    if (!next.length) return { answer: 'Im Ferienplan stehen keine weiteren Ferien.' };
    return { answer: `Die nächsten Ferien der HKV Aarau:\n${next.map((f) => `• ${f.name}: ${fmtDay(f.start)} bis ${fmtDay(f.end)}`).join('\n')}` };
  }

  // Eigene Werte
  if (has(q, 'mein schnitt', 'meine note', 'mein notenschnitt', 'durchschnitt', 'wie stehe ich', 'wie bin ich')) {
    const year = await currentYear(pool);
    const res = await pool.query(
      `SELECT s.points, COALESCE(t.max_points, s.max_points) AS max, t.module_code
       FROM submissions s JOIN tasks t ON t.id = s.task_id
       WHERE s.user_id = $1 AND t.school_year_id = $2 AND s.points IS NOT NULL`,
      [user.id, year.id]
    );
    const graded = res.rows.filter((r) => r.max > 0).map((r) => calculateSwissGrade(Number(r.points), Number(r.max)));
    if (!graded.length) return { answer: `Du hast im ${year.label} noch keine Punkte eingetragen. Das geht im ATL-Tracker oder im Tab „Noten“.` };
    const avg = graded.reduce((a, b) => a + b, 0) / graded.length;
    return { answer: `Dein Notenschnitt im ${year.label}: ${avg.toFixed(2)} aus ${graded.length} bewerteten Aufgaben. Details pro Modul im Tab „Noten“. (Nur du siehst diese Werte.)` };
  }
  if (has(q, 'llp', 'lernleistung', 'leistungsausweis', 'promotion', '3600')) {
    if (has(q, 'meine', 'habe ich', 'mein stand', 'wie viele')) {
      const year = await currentYear(pool);
      const llp = await loadLlp(pool, user.id, year);
      return {
        answer: `Im ${year.label} hast du ${fmtNum(llp.total.earned)} von ${fmtNum(llp.total.possible)} LLP (bisher möglich: ${fmtNum(llp.total.possibleSoFar)}). `
          + 'Präsenz zählt 0.5 LLP pro Lektion, sofern du im Stundenplan eingecheckt hast. Den ganzen Leistungsausweis siehst du im Tab „Noten“.',
      };
    }
  }

  // Zertifikate
  const cert = hkv.zertifikate.liste.find((z) => q.includes(z.kuerzel.toLowerCase()));
  if (cert) {
    return { answer: `${cert.name}: ${cert.was}\nPasst zu: ${cert.modul}.\nMehr: ${cert.links[0][1]}` };
  }

  // Bachelor nach dem HF
  if (has(q, 'bachelor', 'fachhochschule', ' fh', 'ects', 'kalaidos', 'zhaw', 'fhnw', 'ffhs', 'bfh', 'nach dem hf', 'weiterbildung')) {
    const opts = hkv.bachelor.optionen.slice(0, 4).map((o) => `• ${o.schule} (${o.ort.split('·')[0].trim()}): ${o.anrechnung}; ${o.dauer}; ${o.kosten}`);
    return { answer: `Nach dem HF ist ein verkürzter Bachelor möglich:\n${opts.join('\n')}\n\nFaustregel: Kalaidos ist schnell und flexibel, aber teurer; die ZHAW ist günstiger, dauert aber länger. Vollständiger Vergleich im Tab „Infos → Nach dem HF“. Angaben ohne Gewähr.` };
  }

  // Kontakte
  if (has(q, 'kontakt', 'lehrgangsleitung', 'sekretariat', 'telefon', 'oeffnungszeit', 'wen frage', 'ansprechperson')) {
    return { answer: `Kontakte der HKV Aarau:\n${hkv.hfwi.kontakte.map((k) => `• ${k.rolle}: ${k.name}, ${k.mail}${k.tel ? `, ${k.tel}` : ''}`).join('\n')}\nSekretariat: ${hkv.hfwi.oeffnungszeiten.join(' · ')}` };
  }

  // Modul-Infos
  if (mod) {
    const lehrplan = hkv.hfwi.lehrplan.flatMap((y) => y.module.map((m) => ({ jahr: y.jahr, name: m[0], lekt: m[1], stunden: m[2] })));
    const match = lehrplan.find((l) => normalize(l.name).split(' ').some((w) => w.length >= 5 && normalize(mod.name).includes(w)));
    const tasks = await pool.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(max_points), 0)::float AS pts FROM tasks WHERE module_code = $1',
      [mod.code]
    );
    return {
      answer: `${mod.code}: ${mod.name}. ${mod.lektionen ? `${mod.lektionen} Lektionen (= ${fmtNum(mod.lektionen * 0.5)} Präsenz-LLP)` : ''}`
        + `${match ? `, laut Lehrplan ${match.stunden} Lernstunden im ${match.jahr}` : ''}. `
        + `Im ATL-Tracker sind ${tasks.rows[0].n} Aufgaben mit zusammen ${fmtNum(tasks.rows[0].pts)} Punkten erfasst.`,
      suggestions: [`Wann ist ${mod.code}?`, `Nächste Prüfung ${mod.code}?`],
    };
  }

  // Bisherige FAQ (Bedienung, Datenschutz, Registrierung …)
  const fromFaq = faqMatch(raw);
  if (fromFaq) return { answer: fromFaq };

  return {
    answer: `Dazu habe ich keine sichere Antwort. ${capabilities()}\n\nFür alles andere: Frag im Forum, da hilft die Klasse.`,
    suggestions: SUGGESTIONS.slice(0, 6),
    fallback: true,
  };
}

module.exports = {
  localAnswer, parseGradeQuestion, parseNeededQuestion, roomHint, detectModule, normalize, SUGGESTIONS,
};
