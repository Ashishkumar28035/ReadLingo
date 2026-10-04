import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGoogleTranslation,
  getHindiTranslation,
  getCachedWord,
  lookupCache,
  lookupWord,
} from '../src/controllers/wordController.js';

describe('Word Controller - Hindi Translation & Lookup Flow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupCache.clear();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    lookupCache.clear();
    globalThis.fetch = originalFetch;
  });

  // Helper mock response generator
  const createMockResponse = (status, data, ok = status >= 200 && status < 300) => ({
    ok,
    status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  });

  test('1. Successful Google translation returns clean Hindi text', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com')) {
        return createMockResponse(200, [
          [['किताब', 'book', null, null, 10]],
          null,
          'en',
        ]);
      }
      return originalFetch(url);
    };

    const translation = await fetchGoogleTranslation('book');
    assert.equal(translation, 'किताब');
  });

  test('2. Google translation failure -> falls back to MyMemory translation', async () => {
    let googleAttempted = false;
    let myMemoryAttempted = false;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com')) {
        googleAttempted = true;
        return createMockResponse(500, { error: 'Google internal error' }, false);
      }
      if (urlStr.includes('api.mymemory.translated.net')) {
        myMemoryAttempted = true;
        return createMockResponse(200, {
          responseData: {
            translatedText: 'पुस्तक',
            match: 1,
          },
          matches: [
            { translation: 'पुस्तक', quality: 90, match: 1 },
          ],
        });
      }
      return originalFetch(url);
    };

    const translation = await getHindiTranslation('book');
    assert.equal(googleAttempted, true, 'Google Translate should be attempted first');
    assert.equal(myMemoryAttempted, true, 'MyMemory should be called as secondary fallback');
    assert.equal(translation, 'पुस्तक');
  });

  test('3. Both providers fail -> returns "Translation not available."', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com')) {
        return createMockResponse(503, {}, false);
      }
      if (urlStr.includes('api.mymemory.translated.net')) {
        return createMockResponse(429, {}, false);
      }
      if (urlStr.includes('api.dictionaryapi.dev')) {
        return createMockResponse(200, [
          {
            word: 'fallbackword',
            phonetic: '/fɔːlbæk/',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'A plan or course of action.', example: 'He had a fallback.' }],
              },
            ],
          },
        ]);
      }
      return originalFetch(url);
    };

    let responsePayload = null;
    const req = { query: { word: 'fallbackword' } };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return res;
      },
      json: (data) => {
        responsePayload = data;
        return data;
      },
    };

    await lookupWord(req, res);
    assert.ok(responsePayload);
    assert.equal(responsePayload.word, 'fallbackword');
    assert.equal(responsePayload.hindiMeaning, 'Translation not available.');
    assert.equal(responsePayload.definition, 'A plan or course of action.');
  });

  test('4. Degraded response ("Translation not available.") is NOT cached', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com') || urlStr.includes('api.mymemory.translated.net')) {
        return createMockResponse(500, {}, false);
      }
      if (urlStr.includes('api.dictionaryapi.dev')) {
        return createMockResponse(200, [
          {
            word: 'uncachedword',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'A word that should not be cached.', example: 'Sample example' }],
              },
            ],
          },
        ]);
      }
      return createMockResponse(404, {}, false);
    };

    let responsePayload = null;
    const req = { query: { word: 'uncachedword' } };
    const res = {
      status: () => res,
      json: (data) => {
        responsePayload = data;
        return data;
      },
    };

    await lookupWord(req, res);
    assert.ok(responsePayload);
    assert.equal(responsePayload.hindiMeaning, 'Translation not available.');

    // Verify cache does NOT store this entry
    const cached = getCachedWord('uncachedword');
    assert.equal(cached, null, 'Degraded response must not be cached in server memory');
  });

  test('5. Successful Hindi response IS cached', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com')) {
        return createMockResponse(200, [
          [['किताब', 'book', null, null, 10]],
          null,
          'en',
        ]);
      }
      if (urlStr.includes('api.dictionaryapi.dev')) {
        return createMockResponse(200, [
          {
            word: 'book',
            phonetic: '/bʊk/',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'A set of printed pages.', example: 'He read a book.' }],
              },
            ],
          },
        ]);
      }
      return createMockResponse(404, {}, false);
    };

    let responsePayload = null;
    const req = { query: { word: 'book' } };
    const res = {
      status: () => res,
      json: (data) => {
        responsePayload = data;
        return data;
      },
    };

    await lookupWord(req, res);
    assert.ok(responsePayload);
    assert.equal(responsePayload.hindiMeaning, 'किताब');

    // Verify cache contains the entry
    const cached = getCachedWord('book');
    assert.ok(cached, 'Successful response with Hindi meaning must be cached');
    assert.equal(cached.word, 'book');
    assert.equal(cached.hindiMeaning, 'किताब');
  });

  test('6. Existing dictionary lookup still works (definition, phonetic, pos, example)', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('translate.googleapis.com')) {
        return createMockResponse(200, [[['परीक्षण', 'testing']]]);
      }
      if (urlStr.includes('api.dictionaryapi.dev')) {
        return createMockResponse(200, [
          {
            word: 'testing',
            phonetic: '/ˈtɛstɪŋ/',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [
                  {
                    definition: 'The act of conducting a test.',
                    example: 'Testing is essential for quality software.',
                  },
                ],
              },
            ],
          },
        ]);
      }
      return originalFetch(url);
    };

    let responsePayload = null;
    const req = { query: { word: 'testing' } };
    const res = {
      status: () => res,
      json: (data) => {
        responsePayload = data;
        return data;
      },
    };

    await lookupWord(req, res);
    assert.ok(responsePayload);
    assert.equal(responsePayload.word, 'testing');
    assert.equal(responsePayload.phonetic, '/ˈtɛstɪŋ/');
    assert.equal(responsePayload.partOfSpeech, 'noun');
    assert.equal(responsePayload.definition, 'The act of conducting a test.');
    assert.equal(responsePayload.exampleSentence, 'Testing is essential for quality software.');
    assert.equal(responsePayload.hindiMeaning, 'परीक्षण');
  });
});
