import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  shuffleArray,
  formatDisplayText,
  formatDisplayHindi,
  validateSentenceWordUsage,
  calculateAccuracy,
  generateMcqQuestions,
  getEligibleMcqCount,
} from '../../src/utils/practiceUtils.js';

describe('Practice Logic & Verification Tests', () => {
  describe('1. Sentence Word Usage Validation', () => {
    const target = 'read';

    test('validates exact match in a normal sentence', () => {
      const res = validateSentenceWordUsage('I like to read books in the morning.', target);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.reason, 'ok');
    });

    test('validates case-insensitive match (capitalized or uppercase)', () => {
      const res1 = validateSentenceWordUsage('Read this article carefully.', target);
      assert.strictEqual(res1.isValid, true);

      const res2 = validateSentenceWordUsage('PLEASE READ BEFORE SIGNING.', target);
      assert.strictEqual(res2.isValid, true);
    });

    test('validates when target word is adjacent to various punctuation marks', () => {
      const cases = [
        'Do you read? Yes, I do.',
        'Always read, think, and reflect.',
        'He yelled: "read!"',
        'You must (read) this chapter.',
        'First-time read: amazing story.',
      ];

      for (const sentence of cases) {
        const res = validateSentenceWordUsage(sentence, target);
        assert.strictEqual(res.isValid, true, `Failed for sentence: ${sentence}`);
      }
    });

    test('validates sentences with repeated spaces or surrounding newlines', () => {
      const res = validateSentenceWordUsage('I   need   to   read   this   now.', target);
      assert.strictEqual(res.isValid, true);
    });

    test('rejects input that is just the single target word alone without a full sentence', () => {
      const res = validateSentenceWordUsage('read', target);
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.reason, 'single_word_only');

      const res2 = validateSentenceWordUsage('immediate', 'immediate');
      assert.strictEqual(res2.isValid, false);
      assert.strictEqual(res2.reason, 'single_word_only');
    });

    test('strictly rejects target word embedded inside a longer word (avoiding false positives)', () => {
      // "read" is a substring of "treadmill", "spread", "already", "thread", "reading"
      const falsePositiveCases = [
        'He runs on the treadmill every day.',
        'The virus can spread rapidly.',
        'I have already finished my work.',
        'Sew with a red thread.',
        'She is reading a story right now.',
      ];

      for (const sentence of falsePositiveCases) {
        const res = validateSentenceWordUsage(sentence, target);
        assert.strictEqual(
          res.isValid,
          false,
          `False positive detected for substring in: "${sentence}"`
        );
        assert.strictEqual(res.reason, 'missing_target_word');
      }
    });

    test('verifies "immediately" does not falsely match target word "immediate"', () => {
      const res = validateSentenceWordUsage('you have to go immediately', 'immediate');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.reason, 'missing_target_word');
    });

    test('rejects empty or whitespace-only sentence input', () => {
      assert.strictEqual(validateSentenceWordUsage('', target).isValid, false);
      assert.strictEqual(validateSentenceWordUsage('   ', target).isValid, false);
      assert.strictEqual(validateSentenceWordUsage(null, target).isValid, false);
    });

    test('rejects empty target word', () => {
      assert.strictEqual(validateSentenceWordUsage('Valid sentence here.', '').isValid, false);
      assert.strictEqual(validateSentenceWordUsage('Valid sentence here.', null).isValid, false);
    });
  });

  describe('2. MCQ Question Generation & Distractors', () => {
    const mockVocabulary = [
      { _id: '1', word: 'benevolent', hindiMeaning: 'परोपकारी', definition: 'well meaning and kindly' },
      { _id: '2', word: 'meticulous', hindiMeaning: 'सावधान / सूक्ष्म', definition: 'very careful' },
      { _id: '3', word: 'resilient', hindiMeaning: 'लचीला / सहनशील', definition: 'able to recover quickly' },
      { _id: '4', word: 'candid', hindiMeaning: 'निष्कपट / खरा', definition: 'truthful and straightforward' },
      { _id: '5', word: 'gregarious', hindiMeaning: 'मिलनसार', definition: 'fond of company; sociable' },
      { _id: '6', word: 'ephemeral', hindiMeaning: 'अल्पकालिक', definition: 'lasting for a very short time' },
    ];

    test('returns empty array when vocabulary has fewer than 4 valid words', () => {
      const smallVocab = [
        { word: 'apple', hindiMeaning: 'सेब' },
        { word: 'banana', hindiMeaning: 'केला' },
      ];
      assert.deepStrictEqual(generateMcqQuestions(smallVocab, 5), []);
      assert.deepStrictEqual(generateMcqQuestions([], 5), []);
      assert.deepStrictEqual(generateMcqQuestions(null, 5), []);
    });

    test('safely filters out words with missing, empty, or non-Hindi meanings', () => {
      const mixedVocab = [
        { word: 'one', hindiMeaning: 'एक' },
        { word: 'two', hindiMeaning: '' }, // missing
        { word: 'three', hindiMeaning: null }, // null
        { word: 'four', hindiMeaning: 'Description' }, // English text without Devanagari
        { word: 'five', hindiMeaning: 'पाँच' },
        { word: 'six', hindiMeaning: 'छह' },
        { word: 'seven', hindiMeaning: 'सात' },
      ];
      const questions = generateMcqQuestions(mixedVocab, 4);
      assert.ok(questions.length > 0);
      for (const q of questions) {
        assert.notStrictEqual(q.originalWord.word, 'two');
        assert.notStrictEqual(q.originalWord.word, 'three');
        assert.notStrictEqual(q.originalWord.word, 'four');
      }
    });

    test('generates exactly 4 distinct options per question with 0 duplicates', () => {
      const questions = generateMcqQuestions(mockVocabulary, 5);
      assert.ok(questions.length > 0);

      for (const q of questions) {
        assert.strictEqual(q.options.length, 4, 'Each MCQ must have exactly 4 options');
        const uniqueOptions = new Set(q.options);
        assert.strictEqual(uniqueOptions.size, 4, 'Options must be strictly distinct (no duplicates)');
        assert.ok(q.options.includes(q.correctAnswer), 'Options must contain the correct answer');
      }
    });

    test('generates both word_to_hindi and hindi_to_word questions', () => {
      const questions = generateMcqQuestions(mockVocabulary, 6);
      const types = questions.map((q) => q.type);
      assert.ok(types.includes('word_to_hindi'), 'Should include English to Hindi questions');
      assert.ok(types.includes('hindi_to_word'), 'Should include Hindi to English questions');
    });

    test('getEligibleMcqCount calculates eligible questions accurately', () => {
      assert.strictEqual(getEligibleMcqCount([]), 0);
      assert.strictEqual(getEligibleMcqCount(mockVocabulary), 6);
    });

    test('randomizes options positions so correct answer is not statically fixed at index 0', () => {
      const positions = new Set();
      for (let run = 0; run < 10; run++) {
        const questions = generateMcqQuestions(mockVocabulary, 4);
        for (const q of questions) {
          const idx = q.options.indexOf(q.correctAnswer);
          positions.add(idx);
        }
      }
      assert.ok(positions.size > 1, 'Correct answer should be distributed across options positions');
    });
  });

  describe('3. Score and Accuracy Calculation', () => {
    test('calculates correct percentages and handles zero boundaries', () => {
      assert.strictEqual(calculateAccuracy(0, 0), 0);
      assert.strictEqual(calculateAccuracy(5, 10), 50);
      assert.strictEqual(calculateAccuracy(7, 10), 70);
      assert.strictEqual(calculateAccuracy(10, 10), 100);
      assert.strictEqual(calculateAccuracy(0, 5), 0);
      assert.strictEqual(calculateAccuracy(1, 3), 33);
    });
  });

  describe('4. Formatting & Sanitization Helpers', () => {
    test('formatDisplayText strips HTML, wiki markup, and normalizes spaces', () => {
      const raw = '<b>Test</b> <script>alert(1)</script>  definition with extra   spaces.';
      assert.strictEqual(formatDisplayText(raw), 'Test definition with extra spaces.');
    });

    test('formatDisplayHindi cleans Latin artifacts and returns clean Hindi', () => {
      const raw = 'परोपकारी (adjective) [well meaning]';
      const clean = formatDisplayHindi(raw, 'benevolent');
      assert.strictEqual(clean, 'परोपकारी');
    });

    test('formatDisplayHindi returns empty string for purely English text', () => {
      assert.strictEqual(formatDisplayHindi('Description', 'abstraction'), '');
      assert.strictEqual(formatDisplayHindi('Some text here', 'word'), '');
    });

    test('shuffleArray returns a shuffled copy and preserves length without mutating original', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const copy = [...original];
      const shuffled = shuffleArray(original);
      assert.strictEqual(shuffled.length, original.length);
      assert.deepStrictEqual(original, copy, 'Original array must remain unmutated');
    });
  });
});
