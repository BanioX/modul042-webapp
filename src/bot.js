const faq = require('./faq.json');
const { normalizeText } = require('./challenges');

const STOP_WORDS = new Set([
  'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'wird', 'werden', 'ist', 'sind',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'und', 'oder', 'aber', 'fuer',
  'von', 'mit', 'bei', 'nach', 'ueber', 'kann', 'bitte', 'habe',
]);

function findBotAnswer(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return {
      matched: false,
      reply: 'Hallo! Ich bin dein ATL-Kundendienst-Bot. Wie kann ich dir bei der Notenberechnung, Anonymität oder Registrierung helfen?',
      suggestions: faq.map((item) => item.question),
    };
  }

  const queryNorm = normalizeText(userInput);

  let bestMatch = null;
  let highestScore = 0;

  for (const item of faq) {
    let score = 0;
    for (const kw of item.keywords) {
      const kwNorm = normalizeText(kw);
      if (queryNorm.includes(kwNorm)) {
        score += 3;
      }
    }
    const qWords = normalizeText(item.question).split(' ');
    for (const qw of qWords) {
      if (qw.length > 3 && !STOP_WORDS.has(qw) && queryNorm.includes(qw)) {
        score += 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  // Require at least a keyword match or multiple content words
  if (bestMatch && highestScore >= 2) {
    return {
      matched: true,
      topic: bestMatch.id,
      question: bestMatch.question,
      reply: bestMatch.answer,
      suggestions: faq.filter((f) => f.id !== bestMatch.id).map((f) => f.question).slice(0, 3),
    };
  }

  return {
    matched: false,
    reply: 'Dazu habe ich in den FAQ leider keine passende Antwort gefunden. Wähle eine der folgenden Fragen oder frage nach Notenformel, Datenschutz, Passwort oder Konto löschen:',
    suggestions: faq.map((f) => f.question),
  };
}

module.exports = {
  faq,
  findBotAnswer,
};
