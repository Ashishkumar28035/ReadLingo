import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import {
  validateSentenceWordUsage,
  getWordFamily,
  getContextualExample,
} from '../../src/utils/practiceUtils.js';
import { checkSentenceGrammar } from '../src/controllers/grammarController.js';

describe('Sentence Formation & Grammar Regression Suite', () => {
  const targetWord = 'sharing';

  describe('1. Word Usage & Sentence Completeness Validation', () => {
    test('input: "I do not want to sharing anything with you." -> word detected (exact target), complete sentence', () => {
      const res = validateSentenceWordUsage('I do not want to sharing anything with you.', targetWord, {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.matchedForm, 'sharing');
      assert.strictEqual(res.isExact, true);
      assert.strictEqual(res.isWordFamily, false);
    });

    test('input: "I do not want to share anything with you." -> valid sentence & accepted word-family usage for "sharing"', () => {
      const res = validateSentenceWordUsage('I do not want to share anything with you.', targetWord, {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.matchedForm, 'share');
      assert.strictEqual(res.isExact, false);
      assert.strictEqual(res.isWordFamily, true);
      assert.strictEqual(res.reason, 'word_family_matched');
    });

    test('input: "I am sharing my notes with my friend." -> valid sentence using exact target', () => {
      const res = validateSentenceWordUsage('I am sharing my notes with my friend.', targetWord, {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.matchedForm, 'sharing');
      assert.strictEqual(res.isExact, true);
    });

    test('input: "I sharing my notes yesterday." -> word detected, but sentence structure requires grammar evaluation', () => {
      const res = validateSentenceWordUsage('I sharing my notes yesterday.', targetWord, {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.matchedForm, 'sharing');
    });

    test('input: "sharing" -> incomplete sentence rejected for this exercise', () => {
      const res = validateSentenceWordUsage('sharing', targetWord, {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.reason, 'single_word_only');
      assert.ok(res.message.includes('complete sentence'));
    });

    test('input: empty input -> validation message, not success', () => {
      const res1 = validateSentenceWordUsage('', targetWord, { allowWordFamily: true });
      assert.strictEqual(res1.isValid, false);
      assert.strictEqual(res1.reason, 'empty');

      const res2 = validateSentenceWordUsage('   ', targetWord, { allowWordFamily: true });
      assert.strictEqual(res2.isValid, false);
      assert.strictEqual(res2.reason, 'empty');
    });

    test('word family generation accepts appropriate forms for "sharing"', () => {
      const family = getWordFamily('sharing');
      assert.ok(family.includes('share'));
      assert.ok(family.includes('shares'));
      assert.ok(family.includes('shared'));
      assert.ok(family.includes('sharing'));
    });

    test('word family does not falsely include adverb "immediately" for adjective "immediate"', () => {
      const family = getWordFamily('immediate');
      assert.ok(!family.includes('immediately'));

      const res = validateSentenceWordUsage('you have to go immediately', 'immediate', {
        allowWordFamily: true,
      });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.reason, 'missing_target_word');
    });
  });

  describe('2. Backend LanguageTool Grammar Checking Evaluation', () => {
    // Helper to mock req/res for controller
    function mockReqRes(body) {
      const req = { body };
      let statusCode = 200;
      let responseData = null;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseData = data;
          return this;
        },
      };

      return { req, res, getStatus: () => statusCode, getData: () => responseData };
    }

    test('REGRESSION TEST: "I do not want to sharing anything with you." detects grammar issue (TO_NON_BASE) and suggests "share"', async () => {
      const { req, res, getData, getStatus } = mockReqRes({
        text: 'I do not want to sharing anything with you.',
        targetWord: 'sharing',
      });

      await checkSentenceGrammar(req, res);

      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.grammarStatus, 'grammar_issue');
      assert.ok(data.matchCount >= 1);
      assert.ok(Array.isArray(data.matches));

      const hasToNonBase = data.matches.some(
        (m) => m.ruleId === 'TO_NON_BASE' || m.message.toLowerCase().includes('base form')
      );
      assert.ok(hasToNonBase, 'Expected LanguageTool rule TO_NON_BASE or base form message');

      const hasShareSuggestion = data.matches.some((m) =>
        m.replacements.some((r) => r.toLowerCase() === 'share')
      );
      assert.ok(hasShareSuggestion, 'Expected suggestion to include "share"');
    });

    test('"I do not want to share anything with you." passes grammar checking with 0 issues', async () => {
      const { req, res, getData } = mockReqRes({
        text: 'I do not want to share anything with you.',
        targetWord: 'sharing',
      });

      await checkSentenceGrammar(req, res);

      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.grammarStatus, 'passed');
      assert.strictEqual(data.matchCount, 0);
      assert.strictEqual(data.matches.length, 0);
    });

    test('"I am sharing my notes with my friend." passes grammar checking with 0 issues', async () => {
      const { req, res, getData } = mockReqRes({
        text: 'I am sharing my notes with my friend.',
        targetWord: 'sharing',
      });

      await checkSentenceGrammar(req, res);

      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.grammarStatus, 'passed');
      assert.strictEqual(data.matchCount, 0);
    });

    test('"I sharing my notes yesterday." detects grammar issue (missing auxiliary verb)', async () => {
      const { req, res, getData } = mockReqRes({
        text: 'I sharing my notes yesterday.',
        targetWord: 'sharing',
      });

      await checkSentenceGrammar(req, res);

      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.grammarStatus, 'grammar_issue');
      assert.ok(data.matchCount >= 1);
    });

    test('rejects empty text with 400 error', async () => {
      const { req, res, getData, getStatus } = mockReqRes({ text: '  ' });

      await checkSentenceGrammar(req, res);

      assert.strictEqual(getStatus(), 400);
      assert.strictEqual(getData().success, false);
    });

    test('rejects text exceeding 1000 characters with 400 error', async () => {
      const longText = 'word '.repeat(300);
      const { req, res, getData, getStatus } = mockReqRes({ text: longText });

      await checkSentenceGrammar(req, res);

      assert.strictEqual(getStatus(), 400);
      assert.strictEqual(getData().success, false);
      assert.ok(getData().error.includes('1000 characters'));
    });
  });

  describe('3. Grammar API Failure & Resilience Simulations', () => {
    function mockReqRes(body) {
      const req = { body };
      let statusCode = 200;
      let responseData = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseData = data;
          return this;
        },
      };
      return { req, res, getStatus: () => statusCode, getData: () => responseData };
    }

    test('simulated network failure -> returns "unavailable" and NEVER "passed"', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('getaddrinfo ENOTFOUND api.languagetool.org');
      };

      try {
        const uniqueText = `Network failure test sentence ${Date.now()}`;
        const { req, res, getData } = mockReqRes({ text: uniqueText });
        await checkSentenceGrammar(req, res);

        const data = getData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.grammarStatus, 'unavailable');
        assert.strictEqual(data.matches.length, 0);
        assert.ok(data.message.includes('could not be checked'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('simulated API timeout -> returns "unavailable"', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        throw err;
      };

      try {
        const uniqueText = `Timeout test sentence ${Date.now()}`;
        const { req, res, getData } = mockReqRes({ text: uniqueText });
        await checkSentenceGrammar(req, res);

        const data = getData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.grammarStatus, 'unavailable');
        assert.ok(data.message.includes('could not be checked'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('simulated HTTP 429 rate limit -> returns "unavailable"', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      try {
        const uniqueText = `Rate limit test sentence ${Date.now()}`;
        const { req, res, getData } = mockReqRes({ text: uniqueText });
        await checkSentenceGrammar(req, res);

        const data = getData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.grammarStatus, 'unavailable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('simulated HTTP 500 server error -> returns "unavailable"', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Server crash' }),
      });

      try {
        const uniqueText = `Internal server error test sentence ${Date.now()}`;
        const { req, res, getData } = mockReqRes({ text: uniqueText });
        await checkSentenceGrammar(req, res);

        const data = getData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.grammarStatus, 'unavailable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('simulated malformed JSON response -> returns "unavailable"', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      try {
        const uniqueText = `Malformed JSON test sentence ${Date.now()}`;
        const { req, res, getData } = mockReqRes({ text: uniqueText });
        await checkSentenceGrammar(req, res);

        const data = getData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.grammarStatus, 'unavailable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('4. Reference Example Contextual Fallback', () => {
    test('returns natural, complete example sentence instead of generic advice', () => {
      const ex1 = getContextualExample('sharing');
      assert.ok(ex1 && ex1.length > 10);
      assert.ok(ex1.toLowerCase().includes('sharing'));
      assert.ok(!ex1.toLowerCase().includes('try describing'));

      const ex2 = getContextualExample('immediate');
      assert.ok(ex2 && ex2.length > 10);
      assert.ok(ex2.toLowerCase().includes('immediate'));
      assert.ok(!ex2.toLowerCase().includes('try describing'));
    });
  });

  describe('5. Route-Level Authentication & Rate Limiting Enforcement', () => {
    let server;
    let baseUrl;

    before(async () => {
      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const address = server.address();
          baseUrl = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('POST /api/words/check-grammar without token returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/words/check-grammar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'I am sharing my notes.' }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized/i);
    });

    test('POST /api/words/check-grammar with invalid token returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/words/check-grammar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.jwt.token',
        },
        body: JSON.stringify({ text: 'I am sharing my notes.' }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized/i);
    });
  });
});
