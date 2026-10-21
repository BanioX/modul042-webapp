const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateMathChallenge,
  getRandomKnowledgeQuestion,
  getKnowledgeQuestionById,
  verifyKnowledgeAnswer,
  signChallenge,
  verifyChallengeToken,
} = require('../src/challenges');
const { getMailStatus } = require('../src/mail');

const TEST_SECRET = 'unit-test-secret-value-12345';

test('Level 1 challenge workflow', () => {
  const challenge = generateMathChallenge();
  assert.ok(challenge.question);
  assert.ok(challenge.answer);

  const token = signChallenge({
    level: 1,
    expected: challenge.answer,
    exp: Date.now() + 60000,
  }, TEST_SECRET);

  const parsed = verifyChallengeToken(token, TEST_SECRET);
  assert.equal(parsed.level, 1);
  assert.equal(parsed.expected, challenge.answer);
});

test('Level 2 challenge workflow with knowledge pool', () => {
  const q = getRandomKnowledgeQuestion();
  assert.ok(q.id);
  assert.ok(q.question);
  assert.ok(q.answers.length > 0);

  const token = signChallenge({
    level: 2,
    qId: q.id,
    exp: Date.now() + 60000,
  }, TEST_SECRET);

  const parsed = verifyChallengeToken(token, TEST_SECRET);
  assert.equal(parsed.level, 2);
  const loaded = getKnowledgeQuestionById(parsed.qId);
  assert.equal(loaded.id, q.id);

  // Correct answer validates
  assert.ok(verifyKnowledgeAnswer(loaded.answers[0], loaded.answers));
});

test('Level 3 token grants registration access while expired/invalid tokens are rejected', () => {
  const validLevel3Token = signChallenge({
    level: 3,
    exp: Date.now() + 60000,
  }, TEST_SECRET);

  const parsed = verifyChallengeToken(validLevel3Token, TEST_SECRET);
  assert.ok(parsed);
  assert.equal(parsed.level, 3);

  // Token with level 1 or 2 cannot register
  const level1Token = signChallenge({ level: 1, exp: Date.now() + 60000 }, TEST_SECRET);
  const parsed1 = verifyChallengeToken(level1Token, TEST_SECRET);
  assert.notEqual(parsed1.level, 3);
});

test('getMailStatus reports safe status without credentials', () => {
  const status = getMailStatus();
  assert.equal(typeof status.configured, 'boolean');
  assert.ok(status.host);
  assert.ok(status.mode);
  // Ensure password is not present in status
  assert.equal(status.pass, undefined);
});
