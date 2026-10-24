/**
 * Hilfe-Bot. Mit GEMINI_API_KEY antwortet Google Gemini mit dem Kontext des HUB-042,
 * ohne Key eine lokale FAQ. An Google gehen nur die (geschwärzte) Frage und
 * allgemeine Infos, nie Namen, E-Mail-Adressen, Punkte oder Noten.
 */
const rateLimit = require('express-rate-limit');
const faq = require('../data/faq.json');
const { localAnswer } = require('../bot/local');
const features = require('../data/features.json');
const hkv = require('../data/hkv.json');

const MAX_QUESTION = 500;

function redact(text) {
  return String(text || '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[E-Mail entfernt]')
    .replace(/\+?\d[\d\s/.-]{7,}\d/g, '[Nummer entfernt]')
    .slice(0, MAX_QUESTION);
}

function faqAnswer(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const item of faq) {
    const score = item.keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best ? best.answer : null;
}

/** Seitenbezogener Zusatzkontext, nur klassenweite Daten (keine Personendaten). */
async function pageContext(pool, page) {
  const lines = [];
  if (['dashboard', 'stundenplan', 'aufgaben', 'noten'].includes(page)) {
    const lessons = await pool.query(
      `SELECT to_char(l.date, 'DD.MM.YYYY') AS d, to_char(l.start_time, 'HH24:MI') AS s, to_char(l.end_time, 'HH24:MI') AS e,
              COALESCE(m.name, l.title) AS name, l.room, l.dozent
       FROM lessons l LEFT JOIN modules m ON m.code = l.module_code
       WHERE l.date >= (NOW() AT TIME ZONE 'Europe/Zurich')::date ORDER BY l.date, l.start_time LIMIT 8`
    );
    lines.push(`Nächste Lektionen: ${lessons.rows.map((l) => `${l.d} ${l.s || ''}-${l.e || ''} ${l.name} (${[l.dozent, l.room].filter(Boolean).join(', ')})`).join('; ')}`);
    const tasks = await pool.query(
      `SELECT to_char(t.due_at AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI') AS d, t.title, t.kind, t.max_points, COALESCE(m.name, '') AS modul
       FROM tasks t LEFT JOIN modules m ON m.code = t.module_code
       WHERE t.due_at > NOW() ORDER BY t.due_at LIMIT 10`
    );
    lines.push(`Nächste Fristen: ${tasks.rows.map((t) => `${t.d} ${t.modul} ${t.title} (${t.kind}${t.max_points ? `, ${Number(t.max_points)} Punkte` : ''})`).join('; ')}`);
    const holidays = hkv.ferien.filter((f) => f.end >= new Date().toISOString().slice(0, 10)).slice(0, 3);
    lines.push(`Nächste Ferien: ${holidays.map((f) => `${f.name} ${f.start} bis ${f.end}`).join('; ')}`);
  }
  if (page === 'noten' || page === 'aufgaben') {
    lines.push('Notenformel: Note = Punkte × 5 ÷ Maximum + 1, Rundung auf 0.1. Modul-LLP = Präsenz (0.5 pro Lektion) + Maximalpunkte; Modulnote = erreicht ÷ möglich × 5 + 1.');
  }
  if (page === 'infos') {
    lines.push(`Bachelor nach HF: ${hkv.bachelor.optionen.map((o) => `${o.schule} (${o.ort}): ${o.anrechnung}; ${o.dauer}; ${o.kosten}`).join(' | ')}. ${hkv.bachelor.stand}`);
    lines.push(`Zertifikate: ${hkv.zertifikate.liste.map((z) => `${z.kuerzel} – ${z.name}: ${z.was}`).join(' | ')}`);
    lines.push(`Lehrplan: ${hkv.hfwi.lehrplan.map((y) => `${y.jahr}: ${y.module.map((m) => m[0]).join(', ')}`).join(' | ')}`);
  }
  if (page === 'forum') lines.push('Forum-Kategorien: Fragen, Wissenswertes, Zusammenfassungen, Lerngruppen, Off-Topic. Keine Prüfungslösungen posten.');
  return lines.join('\n');
}

function systemPrompt(page, extra = '') {
  const h = hkv.hfwi;
  return [
    'Du bist der Hilfe-Bot von HUB-042, einer inoffiziellen Klassen-App der HFWI-2504-AA (Dipl. Wirtschaftsinformatiker*in HF, HKV Aarau),',
    'entstanden als Schulprojekt im Modul 042 Applications Engineering. Antworte kurz, freundlich, auf Deutsch (Schweizer Rechtschreibung, kein ß).',
    'Du kennst keine persönlichen Daten der Nutzer*innen und fragst auch nicht danach. Bei Fragen zu offiziellen Noten, Fristen oder Reglementen:',
    'auf MS Teams, Tocco und die Lehrgangsleitung verweisen. Erfinde keine Fakten; wenn du etwas nicht weisst, sag es.',
    `Aktuelle Seite der Person: ${page || 'unbekannt'}.`,
    `Funktionen: ${features.map((f) => `${f.title}: ${f.text}`).join(' | ')}`,
    `Eckdaten: ${h.eckdaten.map(([k, v]) => `${k}: ${v}`).join('; ')}.`,
    `Englisch: ${h.englischRegel.join('; ')}.`,
    `Kontakte HKV: ${h.kontakte.map((k) => `${k.rolle} ${k.name} ${k.mail}`).join('; ')}.`,
    'Feature-Wünsche und Löschanfragen: alban.hyseni@stud.hkv.ch.',
    'Namensherkunft (bei Fragen wie „Warum heisst die App HUB-042?“): Die Seite entstand während des Unterrichts im Modul 042 Applications Engineering, daher der Name.',
    'Der Macher fand den Namen zudem gut, weil er Sci-Fi-Fan ist und 42 die Antwort auf alle Fragen ist: In Douglas Adams’ „Per Anhalter durch die Galaxis“ (The Hitchhiker’s Guide to the Galaxy, 1979) berechnet der Supercomputer',
    'Deep Thought in 7,5 Millionen Jahren die Antwort auf die endgültige Frage nach dem Leben, dem Universum und dem ganzen Rest: „Zweiundvierzig.“',
    'Original: "The Answer to the Great Question… Of Life, the Universe and Everything… Is… Forty-two," said Deep Thought, with infinite majesty and calm.',
    `FAQ: ${faq.map((f) => f.answer).join(' | ')}`,
    extra ? `Kontext zur aktuellen Seite:\n${extra}` : '',
  ].join('\n');
}

async function askGemini(question, page, extra) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(page, extra) }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = (((data.candidates || [])[0] || {}).content || {}).parts;
    return text ? text.map((p) => p.text || '').join('').trim() : null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = function assistantRoutes(app, ctx) {
  const { pool, requireAuth, asyncRoute } = ctx;
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Der Bot braucht eine kurze Pause. Bitte in ein paar Minuten nochmals.' },
  });

  app.get('/api/assistant', requireAuth, (req, res) => {
    res.json({ ai: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/assistant', requireAuth, limiter, asyncRoute(async (req, res) => {
    const question = redact(req.body.message).trim();
    if (!question) return res.status(400).json({ error: 'Frage fehlt.' });
    const page = String(req.body.page || '').slice(0, 40);
    // Zuerst lokal: Termine, Notenrechner, eigene Werte und App-Wissen (bleibt auf dem Server)
    const local = await localAnswer({ pool, user: req.user, question, page });
    if (!local.fallback || !process.env.GEMINI_API_KEY) {
      return res.json({ ...local, source: 'local' });
    }
    try {
      const answer = await askGemini(question, page, await pageContext(pool, page));
      if (answer) return res.json({ answer, source: 'gemini' });
    } catch (err) {
      console.error('[BOT] Gemini nicht erreichbar:', err.message);
    }
    return res.json({ ...local, source: 'local' });
  }));
};

module.exports.redact = redact;
module.exports.faqAnswer = faqAnswer;
