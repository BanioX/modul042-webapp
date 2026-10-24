const stundenplan = require('./data/stundenplan.json');

const TASK_KINDS = ['ATL', 'Mastery Test', 'Jahresprüfung', 'Diplomprüfung', 'Auftrag', 'Übung', 'Abgabe'];
const FORUM_CATEGORIES = ['Fragen', 'Wissenswertes', 'Zusammenfassungen', 'Lerngruppen', 'Off-Topic'];

// Stundenplan-Einträge ohne eigenes Modul
const NON_MODULE_ENTRIES = ['Reserve', 'Jahresprüfung'];

// Module, die nicht in der Legende des Excel-Stundenplans stehen
const EXTRA_MODULES = {
  1: [{ code: 'Kickoff', name: 'Kickoff, Teambuilding' }],
  // Merkblatt Englisch: 60 Lektionen im 3. Studienjahr, 30 LLP Präsenz + 40 LLP Mastery + 110 LLP IELTS
  // 3. Studienjahr gemäss Broschüre HFWI (Kürzel provisorisch, bis der Stundenplan da ist)
  3: [
    { code: 'ENGL', name: 'Englisch (IELTS Academic)', lektionen: 60 },
    { code: 'SIMU', name: 'Simulation Unternehmensführung', lektionen: 24 },
    { code: 'ICTM', name: 'ICT-Management', lektionen: 40 },
    { code: 'ICTP', name: 'ICT-Produktmanagement', lektionen: 28 },
    { code: 'BUSO', name: 'Business Solutions', lektionen: 48 },
    { code: 'DIGB', name: 'Digital Business', lektionen: 40 },
    { code: 'STRE', name: 'Studienreise', lektionen: 24 },
  ],
};

const SCHOOL_YEARS = [
  {
    key: '1',
    label: '1. Studienjahr',
    klasse: 'HFWI-2504-AA',
    start_date: '2025-04-30',
    end_date: '2026-04-21',
  },
  {
    key: '2',
    label: '2. Studienjahr',
    klasse: 'HFWI-2504-AA',
    start_date: '2026-04-22',
    end_date: '2027-04-21',
  },
  {
    key: '3',
    label: '3. Studienjahr',
    klasse: 'HFWI-2504-AA',
    start_date: '2027-04-22',
    end_date: '2028-04-21',
  },
];

// Farbe pro Modul für Karten und Stundenplan (HKV-Grün-Palette plus Akzente)
const MODULE_COLORS = [
  '#2f7d5b', '#173c43', '#6ebd91', '#3d6f8e', '#b9783f',
  '#7a5c99', '#c0504d', '#4f8a3c', '#2b6f74', '#9a7b2f', '#5a6b73',
];

function lessonsFor(yearKey) {
  return (stundenplan[yearKey] && stundenplan[yearKey].lessons) || [];
}

function modulesFor(yearKey) {
  const entry = stundenplan[yearKey] || { legend: {}, lessons: [] };
  const lektionen = {};
  for (const lesson of entry.lessons) {
    if (!lesson.module || NON_MODULE_ENTRIES.includes(lesson.module)) continue;
    lektionen[lesson.module] = (lektionen[lesson.module] || 0) + (lesson.lektionen || 0);
  }
  const legend = { ...entry.legend };
  (EXTRA_MODULES[yearKey] || []).forEach((m) => {
    legend[m.code] = m.name;
    if (!lektionen[m.code] && m.lektionen) lektionen[m.code] = m.lektionen;
  });
  return Object.entries(legend).map(([code, name], idx) => ({
    code,
    name,
    lektionen: lektionen[code] || 0,
    color: MODULE_COLORS[idx % MODULE_COLORS.length],
  }));
}

module.exports = {
  TASK_KINDS,
  FORUM_CATEGORIES,
  NON_MODULE_ENTRIES,
  SCHOOL_YEARS,
  MODULE_COLORS,
  lessonsFor,
  modulesFor,
};
