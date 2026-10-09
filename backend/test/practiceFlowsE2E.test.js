import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMcqQuestions,
  getEligibleMcqCount,
  validateSentenceWordUsage,
  calculateAccuracy,
  formatDisplayHindi,
} from '../../src/utils/practiceUtils.js';

describe('Practice Flows End-to-End Simulation Test', () => {
  // Real user sample vocabulary matching user 23bk1a05k1@stpetershyd.com
  const userVocab = [
    {
      word: 'accomplish',
      hindiMeaning: 'पूरा हुआ',
      definition: 'achieve or complete successfully',
      exampleSentence: 'The word "accomplish" can be used in your reading vocabulary.',
    },
    {
      word: 'abstraction',
      hindiMeaning: 'Description', // English text, not Hindi
      definition: 'the quality of dealing with ideas rather than events',
      exampleSentence: 'Example not available.',
    },
    {
      word: 'multiple',
      hindiMeaning: 'अनेकthe star is a variable star',
      definition: 'having or involving several parts',
      exampleSentence: 'My Swiss Army knife has multiple blades.',
    },
    {
      word: 'clustered',
      hindiMeaning: 'गुच्छेदार',
      definition: 'growing or situated in a group',
      exampleSentence: 'Example not available.',
    },
    {
      word: 'communication',
      hindiMeaning: 'संवाद',
      definition: 'the imparting or exchanging of information',
      exampleSentence: 'communication of smallpox',
    },
    {
      word: 'immediate',
      hindiMeaning: 'तुरंत',
      definition: 'occurring or done at once; instant',
      exampleSentence: 'Computer users these days expect immediate results when they click on a link.',
    },
    {
      word: 'structure',
      hindiMeaning: 'संरचना',
      definition: 'the arrangement of and relations between the parts or elements',
      exampleSentence: 'The birds had built an amazing structure out of sticks.',
    },
  ];

  test('Flow 1: MCQ Mode with user vocabulary generates valid questions with 4 distinct options', () => {
    // 1. Check eligible questions count
    const eligibleCount = getEligibleMcqCount(userVocab);
    assert.ok(eligibleCount >= 4, `Eligible count should be >= 4 (got ${eligibleCount})`);

    // 2. Generate questions
    const questions = generateMcqQuestions(userVocab, eligibleCount);
    assert.strictEqual(questions.length, eligibleCount);

    let correctCount = 0;
    const incorrectList = [];

    // Simulate user answering questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      assert.strictEqual(q.options.length, 4, 'Must have exactly 4 choices');
      assert.strictEqual(new Set(q.options).size, 4, 'Choices must be distinct');
      assert.ok(q.options.includes(q.correctAnswer), 'Options must include correct answer');

      // User answers correctly on even indices, incorrectly on odd indices
      const selectedOption = i % 2 === 0 ? q.correctAnswer : q.options.find((o) => o !== q.correctAnswer);
      const isCorrect = selectedOption === q.correctAnswer;

      if (isCorrect) {
        correctCount++;
      } else {
        incorrectList.push({
          word: q.originalWord?.word || q.prompt,
          userAnswer: selectedOption,
          correctAnswer: q.correctAnswer,
        });
      }
    }

    // Results screen calculation
    const accuracy = calculateAccuracy(correctCount, questions.length);
    assert.strictEqual(correctCount + incorrectList.length, questions.length);
    assert.ok(accuracy > 0 && accuracy < 100);
  });

  test('Flow 2: Meaning Recall Flow simulates known vs review tracking and retry', () => {
    const sessionWords = [...userVocab];
    let knownCount = 0;
    const reviewList = [];

    for (let i = 0; i < sessionWords.length; i++) {
      const word = sessionWords[i];
      // User marks known if index < 4, else review
      if (i < 4) {
        knownCount++;
      } else {
        reviewList.push(word);
      }
    }

    assert.strictEqual(knownCount, 4);
    assert.strictEqual(reviewList.length, sessionWords.length - 4);

    // Simulate "Retry Missed Words" mini-session
    const retryWords = [...reviewList];
    assert.strictEqual(retryWords.length, 3);
  });

  test('Flow 3: Sentence Formation Flow with target word "immediate"', () => {
    const targetWord = 'immediate';

    // Step A: User tries typing "you have to go immediately" -> rejected (valid word-boundary rule)
    const attempt1 = validateSentenceWordUsage('you have to go immediately', targetWord);
    assert.strictEqual(attempt1.isValid, false);
    assert.strictEqual(attempt1.reason, 'missing_target_word');

    // Step B: User tries typing single word alone "immediate" -> rejected (full sentence required)
    const attempt2 = validateSentenceWordUsage('immediate', targetWord);
    assert.strictEqual(attempt2.isValid, false);
    assert.strictEqual(attempt2.reason, 'single_word_only');

    // Step C: User enters empty string -> rejected
    const attempt3 = validateSentenceWordUsage('   ', targetWord);
    assert.strictEqual(attempt3.isValid, false);
    assert.strictEqual(attempt3.reason, 'empty');

    // Step D: User enters valid sentence "I require immediate attention for this task." -> accepted
    const attempt4 = validateSentenceWordUsage('I require immediate attention for this task.', targetWord);
    assert.strictEqual(attempt4.isValid, true);
    assert.strictEqual(attempt4.reason, 'ok');

    // Step E: Target word uppercase: "IMMEDIATE action must be taken!" -> accepted
    const attempt5 = validateSentenceWordUsage('IMMEDIATE action must be taken!', targetWord);
    assert.strictEqual(attempt5.isValid, true);
  });

  test('Flow 4: formatDisplayHindi correctly ignores English text like "Description"', () => {
    // Abstraction had hindiMeaning: "Description"
    const cleaned = formatDisplayHindi('Description', 'abstraction');
    assert.strictEqual(cleaned, '', 'Non-Hindi text must be rejected');

    // Multiple had hindiMeaning: "अनेकthe star is a variable star"
    const cleanedMultiple = formatDisplayHindi('अनेकthe star is a variable star', 'multiple');
    assert.strictEqual(cleanedMultiple, 'अनेक', 'Devanagari text must be cleaned properly');
  });
});
