const test = require('node:test');
const assert = require('node:assert/strict');
const {
  KNOWLEDGE_QUESTIONS,
  normalizeText,
  verifyKnowledgeAnswer,
  generateMathChallenge,
  signChallenge,
  verifyChallengeToken,
} = require('../src/challenges');

test('knowledge questions pool has at least 15 questions', () => {
  assert.ok(KNOWLEDGE_QUESTIONS.length >= 15, `Expected >= 15 questions, got ${KNOWLEDGE_QUESTIONS.length}`);
});

test('normalizeText strips punctuation, converts umlauts and lowercases', () => {
  assert.equal(normalizeText('  Zürich! '), 'zuerich');
  assert.equal(normalizeText('Graubünden?'), 'graubuenden');
  assert.equal(normalizeText('Weiß'), 'weiss');
});

test('verifyKnowledgeAnswer validates Swiss knowledge questions tolerantly', () => {
  assert.ok(verifyKnowledgeAnswer('Bern', ['bern']));
  assert.ok(verifyKnowledgeAnswer('  bern  ', ['bern']));
  assert.ok(verifyKnowledgeAnswer('Die Stadt Bern', ['bern']));
  assert.ok(verifyKnowledgeAnswer('26', ['26', 'sechsundzwanzig']));
  assert.ok(verifyKnowledgeAnswer('Sechsundzwanzig Kantone', ['26', 'sechsundzwanzig']));
  assert.ok(verifyKnowledgeAnswer('Dufour-Spitze', ['dufourspitze', 'dufour-spitze']));
  assert.ok(!verifyKnowledgeAnswer('Berlin', ['bern']));
});

test('generateMathChallenge creates solvable math problems', () => {
  for (let i = 0; i < 20; i += 1) {
    const ch = generateMathChallenge();
    assert.ok(ch.question.length > 0);
    assert.ok(!Number.isNaN(parseInt(ch.answer, 10)));
  }
});

test('signChallenge and verifyChallengeToken are secure and tamper-proof', () => {
  const secret = 'super-secret-key-12345';
  const token = signChallenge({ level: 1, expected: '42', exp: Date.now() + 60000 }, secret);

  const payload = verifyChallengeToken(token, secret);
  assert.ok(payload);
  assert.equal(payload.level, 1);
  assert.equal(payload.expected, '42');

  // Tampered token fails
  assert.equal(verifyChallengeToken(token + 'tampered', secret), null);

  // Wrong secret fails
  assert.equal(verifyChallengeToken(token, 'wrong-secret'), null);

  // Expired token fails
  const expiredToken = signChallenge({ level: 1, exp: Date.now() - 1000 }, secret);
  assert.equal(verifyChallengeToken(expiredToken, secret), null);
});
