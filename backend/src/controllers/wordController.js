import { cleanEnglishText, cleanHindiText } from '../utils/sanitizer.js';

// In-memory cache for successful word lookups (normalizedWord -> { data, timestamp })
const lookupCache = new Map();
const definitionCache = new Map();
const translationCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL
const MAX_CACHE_SIZE = 1000;

function getCachedWord(normalizedWord) {
  const entry = lookupCache.get(normalizedWord);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    lookupCache.delete(normalizedWord);
    return null;
  }
  return entry.data;
}

function setCachedWord(normalizedWord, data) {
  if (lookupCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = lookupCache.keys().next().value;
    if (oldestKey) lookupCache.delete(oldestKey);
  }
  lookupCache.set(normalizedWord, {
    data,
    timestamp: Date.now(),
  });
}

// Helper: get base/lemmatized word candidates for common plurals/inflections
function getBaseWords(word) {
  const candidates = [];
  if (word.endsWith('ies') && word.length > 4) {
    candidates.push(word.slice(0, -3) + 'y');
  }
  if (
    word.endsWith('ches') ||
    word.endsWith('shes') ||
    word.endsWith('sses') ||
    word.endsWith('xes') ||
    word.endsWith('zes')
  ) {
    candidates.push(word.slice(0, -2));
  }
  // Plural 's' (avoid words ending in 'ss', 'ous', 'us', 'is')
  if (
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('ous') &&
    !word.endsWith('us') &&
    !word.endsWith('is') &&
    word.length > 2
  ) {
    candidates.push(word.slice(0, -1)); // e.g. principles -> principle, systems -> system
  }
  if (word.endsWith('es') && word.length > 3) {
    candidates.push(word.slice(0, -2));
  }
  if (word.endsWith('ing') && word.length > 4) {
    candidates.push(word.slice(0, -3));
    candidates.push(word.slice(0, -3) + 'e');
  }
  if (word.endsWith('ed') && word.length > 3) {
    candidates.push(word.slice(0, -2));
    candidates.push(word.slice(0, -1));
  }
  return [...new Set(candidates.filter(Boolean))];
}

// Helper: fetch from Free Dictionary API (timeout 2.5s)
async function fetchFreeDictionary(term) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReadLingo/1.0)' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || data.length === 0) return null;

    let definition = '';
    let phonetic = '';
    let partOfSpeech = '';
    let example = '';

    // Safely iterate through all entries and meanings
    for (const entry of data) {
      if (!phonetic) {
        const rawPhonetic = entry.phonetic || entry.phonetics?.find((p) => p.text && p.text.trim())?.text || '';
        phonetic = cleanEnglishText(rawPhonetic);
      }
      if (Array.isArray(entry.meanings)) {
        for (const m of entry.meanings) {
          if (!partOfSpeech && m.partOfSpeech) {
            partOfSpeech = cleanEnglishText(m.partOfSpeech).toLowerCase();
          }
          if (Array.isArray(m.definitions)) {
            for (const d of m.definitions) {
              if (!definition && d?.definition && typeof d.definition === 'string') {
                const cleanDef = cleanEnglishText(d.definition);
                if (cleanDef) definition = cleanDef;
              }
              if (!example && d?.example && typeof d.example === 'string') {
                const cleanEx = cleanEnglishText(d.example);
                if (cleanEx) example = cleanEx;
              }
              if (definition && example) break;
            }
          }
          if (definition && example) break;
        }
      }
      if (definition && example) break;
    }

    if (!definition) return null;

    return {
      definition,
      phonetic,
      partOfSpeech,
      example,
    };
  } catch {
    return null;
  }
}

// Helper: fetch from Wiktionary REST API (fast fallback with real examples, timeout 2.5s)
async function fetchWiktionary(term) {
  try {
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': 'ReadLingo/1.0 (education app; contact@readlingo.local)' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.en || !Array.isArray(data.en)) return null;

    let definition = '';
    let partOfSpeech = '';
    let example = '';

    for (const item of data.en) {
      if (!partOfSpeech && item.partOfSpeech) {
        partOfSpeech = cleanEnglishText(item.partOfSpeech).toLowerCase();
      }
      if (Array.isArray(item.definitions)) {
        for (const d of item.definitions) {
          if (!definition && d.definition) {
            const rawDef = cleanEnglishText(d.definition);
            if (rawDef && !rawDef.toLowerCase().startsWith('misspelling')) {
              definition = rawDef;
            }
          }
          if (!example) {
            const rawEx =
              d.parsedExamples?.[0]?.example ||
              d.examples?.[0] ||
              '';
            const cleanEx = cleanEnglishText(rawEx);
            if (cleanEx) {
              example = cleanEx;
            }
          }
          if (definition && example) break;
        }
      }
      if (definition && example) break;
    }

    if (!definition) return null;

    return {
      definition,
      phonetic: '',
      partOfSpeech,
      example,
    };
  } catch {
    return null;
  }
}

// Helper: fallback definition from Datamuse API (fast & reliable, timeout 2s)
async function fetchDatamuseDefinition(term) {
  try {
    const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=d&max=5`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const posMap = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

    for (const item of data) {
      if (Array.isArray(item.defs) && item.defs.length > 0) {
        for (const d of item.defs) {
          if (d && !d.startsWith('N\t')) {
            const parts = d.split('\t');
            const pos = parts[0] || '';
            const defText = cleanEnglishText(parts.slice(1).join('\t'));
            if (defText && !defText.toLowerCase().startsWith('misspelling')) {
              return {
                definition: defText,
                partOfSpeech: posMap[pos] || pos || '',
                phonetic: '',
                example: '',
              };
            }
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: fetch Hindi translation from Google Chrome client endpoint (fast ~300ms, avoids gtx 429 rate limit)
async function fetchGoogleChromeTranslation(term) {
  try {
    const res = await fetch(
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=hi&q=${encodeURIComponent(term)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    if (!data) return '';

    let text = '';
    if (Array.isArray(data)) {
      if (typeof data[0] === 'string') {
        text = data[0];
      } else if (Array.isArray(data[0]) && typeof data[0][0] === 'string') {
        text = data[0][0];
      }
    } else if (typeof data === 'string') {
      text = data;
    }

    return cleanHindiText(text, term);
  } catch {
    return '';
  }
}

// Helper: fetch Hindi translation from Google Translate (gtx endpoint - primary)
async function fetchGoogleTranslation(term) {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(term)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ReadLingo/1.0)',
        },
        signal: AbortSignal.timeout(2500),
      }
    );

    // If Google gtx endpoint rate-limits with 429, seamlessly fall back to Chrome extension endpoint
    if (res.status === 429) {
      const chromeTrans = await fetchGoogleChromeTranslation(term);
      if (chromeTrans && /[\u0900-\u097F]/.test(chromeTrans)) {
        return chromeTrans;
      }
      return '';
    }

    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';

    let translatedText = '';
    for (const segment of data[0]) {
      if (segment && typeof segment[0] === 'string') {
        translatedText += segment[0];
      }
    }

    const cleaned = cleanHindiText(translatedText, term);
    if (cleaned && /[\u0900-\u097F]/.test(cleaned)) {
      return cleaned;
    }

    return '';
  } catch {
    return '';
  }
}

// Helper: fetch Hindi translation from MyMemory API (secondary fallback, timeout 4s)
async function fetchHindiTranslation(term) {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|hi`,
      {
        headers: {
          'User-Agent': 'ReadLingo/1.0',
        },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    if (!data) return '';

    const cleanCandidate = (text) => {
      if (!text || typeof text !== 'string') return '';
      if (text.includes('MYMEMORY WARNING:') || text.includes('QUERY LENGTH LIMIT')) return '';
      return cleanHindiText(text, term);
    };

    let primaryTrans = cleanCandidate(data.responseData?.translatedText);
    const primaryWordCount = primaryTrans ? primaryTrans.split(/\s+/).length : 0;
    const primaryHasDevanagari = /[\u0900-\u097F]/.test(primaryTrans);

    // If primary translation is concise (<= 3 words) and has Devanagari, use it
    if (primaryTrans && primaryHasDevanagari && primaryWordCount <= 3) {
      return primaryTrans;
    }

    // Otherwise, check matches for a clean, concise, high-quality translation
    if (Array.isArray(data.matches)) {
      const matchCandidates = [];
      for (const m of data.matches) {
        if (!m.translation) continue;
        const cleaned = cleanCandidate(m.translation);
        if (!cleaned || !/[\u0900-\u097F]/.test(cleaned)) continue;

        const q = Number(m.quality || 0);
        const matchScore = Number(m.match || 0);
        const wordCount = cleaned.split(/\s+/).length;

        matchCandidates.push({
          text: cleaned,
          quality: q,
          match: matchScore,
          wordCount,
        });
      }

      if (matchCandidates.length > 0) {
        // Sort matches: prioritize concise word-level translations (<= 3 words), then quality + match score
        matchCandidates.sort((a, b) => {
          const aConcise = a.wordCount <= 3 ? 1 : 0;
          const bConcise = b.wordCount <= 3 ? 1 : 0;
          if (aConcise !== bConcise) return bConcise - aConcise;
          return (b.quality + b.match * 50) - (a.quality + a.match * 50);
        });

        const bestMatch = matchCandidates[0];
        if (bestMatch && bestMatch.quality > 0) {
          return bestMatch.text;
        }
      }
    }

    // Fall back to primary if it had Devanagari even if longer
    if (primaryTrans && primaryHasDevanagari) {
      return primaryTrans;
    }

    return '';
  } catch {
    return '';
  }
}

// Combined translation helper: Try Google first (GTX with 429 Chrome fallback), then MyMemory
async function getHindiTranslation(term) {
  const googleTrans = await fetchGoogleTranslation(term);
  if (googleTrans && /[\u0900-\u097F]/.test(googleTrans)) return googleTrans;

  const myMemoryTrans = await fetchHindiTranslation(term);
  if (myMemoryTrans && /[\u0900-\u097F]/.test(myMemoryTrans)) return myMemoryTrans;

  return '';
}

// English definition resolution helper using fastest-successful-result strategy
async function resolveEnglishDefinition(word, baseWords = []) {
  // Check definition cache
  const cached = definitionCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Concurrently start Free Dictionary and Wiktionary for target word
  const freePromise = fetchFreeDictionary(word);
  const wikPromise = fetchWiktionary(word);

  // Fastest-result race: whichever valid definition returns first wins
  const first = await Promise.race([
    freePromise.then((r) => (r?.definition ? { source: 'free', res: r } : new Promise(() => {}))),
    wikPromise.then((r) => (r?.definition ? { source: 'wik', res: r } : new Promise(() => {}))),
    new Promise((resolve) => setTimeout(resolve, 2500, null)),
  ]);

  let result = null;
  if (first?.source === 'free' && first.res?.definition && first.res?.example) {
    result = first.res;
  } else if (first?.source === 'wik') {
    // If Wiktionary finished first (fast CDN ~200ms), wait at most 250ms for Free Dictionary to provide phonetic/POS
    const freeRes = await Promise.race([
      freePromise,
      new Promise((resolve) => setTimeout(resolve, 250, null)),
    ]);
    result = {
      definition: first.res.definition,
      phonetic: freeRes?.phonetic || '',
      partOfSpeech: freeRes?.partOfSpeech || first.res.partOfSpeech || '',
      example: first.res.example || freeRes?.example || '',
    };
  } else if (first?.source === 'free') {
    const wikRes = await Promise.race([
      wikPromise,
      new Promise((resolve) => setTimeout(resolve, 250, null)),
    ]);
    result = {
      definition: first.res.definition,
      phonetic: first.res.phonetic || '',
      partOfSpeech: first.res.partOfSpeech || wikRes?.partOfSpeech || '',
      example: first.res.example || wikRes?.example || '',
    };
  } else {
    // If race timed out, check settled values
    const [f, w] = await Promise.allSettled([freePromise, wikPromise]);
    const fVal = f.status === 'fulfilled' ? f.value : null;
    const wVal = w.status === 'fulfilled' ? w.value : null;
    if (fVal?.definition || wVal?.definition) {
      result = {
        definition: fVal?.definition || wVal?.definition,
        phonetic: fVal?.phonetic || '',
        partOfSpeech: fVal?.partOfSpeech || wVal?.partOfSpeech || '',
        example: fVal?.example || wVal?.example || '',
      };
    }
  }

  if (result?.definition) {
    definitionCache.set(word, { data: result, timestamp: Date.now() });
    return result;
  }

  // 2. Base words fallback
  for (const base of baseWords) {
    const bFree = await fetchFreeDictionary(base);
    if (bFree?.definition) {
      definitionCache.set(word, { data: bFree, timestamp: Date.now() });
      return bFree;
    }
    const bWik = await fetchWiktionary(base);
    if (bWik?.definition) {
      definitionCache.set(word, { data: bWik, timestamp: Date.now() });
      return bWik;
    }
  }

  // 3. Datamuse fallback
  let dmData = await fetchDatamuseDefinition(word);
  if (dmData?.definition) {
    definitionCache.set(word, { data: dmData, timestamp: Date.now() });
    return dmData;
  }

  for (const base of baseWords) {
    dmData = await fetchDatamuseDefinition(base);
    if (dmData?.definition) {
      definitionCache.set(word, { data: dmData, timestamp: Date.now() });
      return dmData;
    }
  }

  return null;
}

// Hindi translation resolution helper with caching
async function resolveHindiTranslation(word, baseWords = []) {
  const cached = translationCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let trans = await getHindiTranslation(word);
  if (!trans && baseWords && baseWords.length > 0) {
    for (const base of baseWords) {
      trans = await getHindiTranslation(base);
      if (trans) break;
    }
  }

  const cleaned = cleanHindiText(trans, word);
  if (cleaned && cleaned !== 'Translation not available.') {
    translationCache.set(word, { data: cleaned, timestamp: Date.now() });
    return cleaned;
  }

  return '';
}

// @desc    Lookup English definition, example sentence, and Hindi translation
// @route   GET /api/words/lookup?word=...
// @access  Public
export const lookupWord = async (req, res) => {
  try {
    const rawWord = req.query.word;

    if (!rawWord || typeof rawWord !== 'string') {
      return res.status(400).json({ message: 'Word parameter is required' });
    }

    // Clean word: trim whitespace, lowercase, and strip edge punctuation
    const normalizedWord = rawWord.trim().toLowerCase();
    const word = normalizedWord.replace(/^[\s"'“‘([{<«–—.,;:!?]+|[\s"'”’)\]}>»–—.,;:!?]+$/g, '').trim();

    if (!word || !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word) || word.length > 45) {
      return res.status(400).json({ message: 'Please provide a valid single English word (up to 45 characters)' });
    }

    // Check server-side in-memory cache first
    const cachedResult = getCachedWord(word);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const baseWords = getBaseWords(word);

    // Parallel fetch for definition and translation
    const [dictData, rawHindi] = await Promise.all([
      resolveEnglishDefinition(word, baseWords),
      resolveHindiTranslation(word, baseWords),
    ]);

    const definition = cleanEnglishText(dictData?.definition) || 'Definition not available.';
    const phonetic = cleanEnglishText(dictData?.phonetic) || '';
    const partOfSpeech = cleanEnglishText(dictData?.partOfSpeech) || '';
    const exampleSentence = cleanEnglishText(dictData?.example) || 'Example not available.';
    const hindiMeaning = cleanHindiText(rawHindi, word) || 'Translation not available.';

    const responsePayload = {
      word,
      phonetic,
      partOfSpeech,
      definition,
      hindiMeaning,
      exampleSentence,
    };

    // Only cache successful word responses with a real Hindi translation (never cache degraded responses)
    if (hindiMeaning && hindiMeaning !== 'Translation not available.') {
      setCachedWord(word, responsePayload);
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Word lookup error:', error);
    res.status(500).json({ message: 'Error retrieving word details' });
  }
};

// @desc    Fast English definition lookup
// @route   GET /api/words/definition?word=...
// @access  Public
export const getWordDefinition = async (req, res) => {
  try {
    const rawWord = req.query.word;

    if (!rawWord || typeof rawWord !== 'string') {
      return res.status(400).json({ message: 'Word parameter is required' });
    }

    const normalizedWord = rawWord.trim().toLowerCase();
    const word = normalizedWord.replace(/^[\s"'“‘([{<«–—.,;:!?]+|[\s"'”’)\]}>»–—.,;:!?]+$/g, '').trim();

    if (!word || !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word) || word.length > 45) {
      return res.status(400).json({ message: 'Please provide a valid single English word (up to 45 characters)' });
    }

    const cachedLookup = getCachedWord(word);
    if (cachedLookup?.definition && cachedLookup.definition !== 'Definition not available.') {
      return res.json({
        word,
        phonetic: cachedLookup.phonetic || '',
        partOfSpeech: cachedLookup.partOfSpeech || '',
        definition: cachedLookup.definition,
        exampleSentence: cachedLookup.exampleSentence || 'Example not available.',
      });
    }

    const baseWords = getBaseWords(word);
    const dictData = await resolveEnglishDefinition(word, baseWords);

    const definition = cleanEnglishText(dictData?.definition) || 'Definition not available.';
    const phonetic = cleanEnglishText(dictData?.phonetic) || '';
    const partOfSpeech = cleanEnglishText(dictData?.partOfSpeech) || '';
    const exampleSentence = cleanEnglishText(dictData?.example) || 'Example not available.';

    res.json({
      word,
      phonetic,
      partOfSpeech,
      definition,
      exampleSentence,
    });
  } catch (error) {
    console.error('Word definition error:', error);
    res.status(500).json({ message: 'Error retrieving word definition' });
  }
};

// @desc    Fast Hindi translation lookup
// @route   GET /api/words/translate?word=...
// @access  Public
export const getWordTranslation = async (req, res) => {
  try {
    const rawWord = req.query.word;

    if (!rawWord || typeof rawWord !== 'string') {
      return res.status(400).json({ message: 'Word parameter is required' });
    }

    const normalizedWord = rawWord.trim().toLowerCase();
    const word = normalizedWord.replace(/^[\s"'“‘([{<«–—.,;:!?]+|[\s"'”’)\]}>»–—.,;:!?]+$/g, '').trim();

    if (!word || !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word) || word.length > 45) {
      return res.status(400).json({ message: 'Please provide a valid single English word (up to 45 characters)' });
    }

    const cachedLookup = getCachedWord(word);
    if (cachedLookup?.hindiMeaning && cachedLookup.hindiMeaning !== 'Translation not available.') {
      return res.json({
        word,
        hindiMeaning: cachedLookup.hindiMeaning,
      });
    }

    const baseWords = getBaseWords(word);
    const rawHindi = await resolveHindiTranslation(word, baseWords);
    const hindiMeaning = cleanHindiText(rawHindi, word) || 'Translation not available.';

    res.json({
      word,
      hindiMeaning,
    });
  } catch (error) {
    console.error('Word translation error:', error);
    res.status(500).json({ message: 'Error retrieving Hindi translation' });
  }
};

export {
  fetchGoogleChromeTranslation,
  fetchGoogleTranslation,
  fetchHindiTranslation,
  getHindiTranslation,
  getCachedWord,
  setCachedWord,
  lookupCache,
  definitionCache,
  translationCache,
};
