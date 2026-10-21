const crypto = require('crypto');

const KNOWLEDGE_QUESTIONS = [
  { id: 1, question: 'Was ist die Bundesstadt / Hauptstadt der Schweiz?', answers: ['bern'] },
  { id: 2, question: 'Wie viele Kantone hat die Schweiz?', answers: ['26', 'sechsundzwanzig'] },
  { id: 3, question: 'Wie heisst der höchste Berggipfel der Schweiz?', answers: ['dufourspitze', 'dufour-spitze', 'dufour spitze', 'monte rosa'] },
  { id: 4, question: 'Welche Stadt ist die einwohnerreichste der Schweiz?', answers: ['zürich', 'zuerich'] },
  { id: 5, question: 'In welchem Jahr wurde die Schweizer Eidgenossenschaft der Überlieferung nach gegründet?', answers: ['1291'] },
  { id: 6, question: 'Welcher Fluss fliesst in einer Schleife durch die Stadt Bern?', answers: ['aare'] },
  { id: 7, question: 'Welches offizielle Währungskürzel hat der Schweizer Franken?', answers: ['chf'] },
  { id: 8, question: 'Wie heisst das Schweizer Bundesparlament (National- und Ständerat)?', answers: ['bundesversammlung', 'parlament'] },
  { id: 9, question: 'Welcher See grenzt an Genf und Lausanne?', answers: ['genfersee', 'lac leman', 'lac léman'] },
  { id: 10, question: 'Welche Farbe hat das Schweizerkreuz auf der Nationalflagge?', answers: ['weiss', 'weiß'] },
  { id: 11, question: 'Aus wie vielen Mitgliedern besteht der Schweizer Bundesrat?', answers: ['7', 'sieben'] },
  { id: 12, question: 'In welcher Stadt befindet sich das Schweizer Bundesgericht?', answers: ['lausanne'] },
  { id: 13, question: 'Welche Landessprache der Schweiz hat am wenigsten Sprecher?', answers: ['rätoromanisch', 'raetoromanisch', 'romanisch'] },
  { id: 14, question: 'Wie heisst die älteste Stadt der Schweiz?', answers: ['chur'] },
  { id: 15, question: 'Welcher Schweizer Kanton ist als einziger offiziell dreisprachig?', answers: ['graubünden', 'graubuenden', 'gr'] },
  { id: 16, question: 'Welches berühmte Matterhorn-Dorf im Wallis ist autofrei?', answers: ['zermatt'] },
];

function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"„“]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

function verifyKnowledgeAnswer(given, acceptableAnswers) {
  const normGiven = normalizeText(given);
  if (!normGiven) return false;
  return acceptableAnswers.some((ans) => {
    const normAns = normalizeText(ans);
    return normGiven === normAns || normGiven.includes(normAns) || normAns.includes(normGiven);
  });
}

function generateMathChallenge() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a;
  let b;
  let answer;

  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 5;
    b = Math.floor(Math.random() * 20) + 3;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 25) + 15;
    b = Math.floor(Math.random() * 14) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 8) + 2;
    b = Math.floor(Math.random() * 8) + 2;
    answer = a * b;
  }

  return {
    question: `${a} ${op === '*' ? '×' : op} ${b}`,
    answer: String(answer),
  };
}

function getRandomKnowledgeQuestion() {
  const idx = Math.floor(Math.random() * KNOWLEDGE_QUESTIONS.length);
  return KNOWLEDGE_QUESTIONS[idx];
}

function getKnowledgeQuestionById(id) {
  return KNOWLEDGE_QUESTIONS.find((q) => q.id === parseInt(id, 10));
}

function signChallenge(payload, secret) {
  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `${dataB64}.${hmac}`;
}

function verifyChallengeToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [dataB64, hmac] = parts;
  const expectedHmac = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  if (hmac !== expectedHmac) return null;
  try {
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  KNOWLEDGE_QUESTIONS,
  normalizeText,
  verifyKnowledgeAnswer,
  generateMathChallenge,
  getRandomKnowledgeQuestion,
  getKnowledgeQuestionById,
  signChallenge,
  verifyChallengeToken,
};
