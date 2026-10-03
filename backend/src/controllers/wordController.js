import { cleanEnglishText, cleanHindiText } from '../utils/sanitizer.js';

// In-memory cache for successful word lookups (normalizedWord -> { data, timestamp })
const lookupCache = new Map();
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

// Helper: fetch from Free Dictionary API (timeout 5s)
async function fetchFreeDictionary(term) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReadLingo/1.0)' },
      signal: AbortSignal.timeout(5000),
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

// Helper: fetch from Wiktionary REST API (fast fallback with real examples)
async function fetchWiktionary(term) {
  try {
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': 'ReadLingo/1.0 (education app; contact@readlingo.local)' },
      signal: AbortSignal.timeout(4000),
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

// Helper: fallback definition from Datamuse API (fast & highly reliable)
async function fetchDatamuseDefinition(term) {
  try {
    const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=d&max=5`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const posMap = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

    // Search across entries for a valid common definition
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

// Helper: fetch Hindi translation from MyMemory API
async function fetchHindiTranslation(term) {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|hi`,
      { signal: AbortSignal.timeout(5000) }
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
    const [dictPromise, transPromise] = [
      (async () => {
        // 1. Try Free Dictionary API for target word
        let result = await fetchFreeDictionary(word);
        if (result?.definition && result?.example) return result;

        // 2. Try Wiktionary API for target word (fast & extracts real examples)
        const wikResult = await fetchWiktionary(word);
        if (wikResult?.definition) {
          return {
            definition: result?.definition || wikResult.definition,
            phonetic: result?.phonetic || '',
            partOfSpeech: result?.partOfSpeech || wikResult.partOfSpeech,
            example: result?.example || wikResult.example,
          };
        }
        if (result?.definition) return result;

        // 3. If base words exist, try Free Dictionary / Wiktionary
        for (const base of baseWords) {
          result = await fetchFreeDictionary(base);
          if (result?.definition) return result;
          const baseWik = await fetchWiktionary(base);
          if (baseWik?.definition) return baseWik;
        }

        // 4. Fallback to Datamuse dictionary
        result = await fetchDatamuseDefinition(word);
        if (result?.definition) return result;

        for (const base of baseWords) {
          result = await fetchDatamuseDefinition(base);
          if (result?.definition) return result;
        }

        return null;
      })(),
      (async () => {
        let trans = await fetchHindiTranslation(word);
        if (!trans) {
          for (const base of baseWords) {
            trans = await fetchHindiTranslation(base);
            if (trans) break;
          }
        }
        return trans;
      })(),
    ];

    const [dictData, rawHindi] = await Promise.all([dictPromise, transPromise]);

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

    // Cache successful lookup in memory
    setCachedWord(word, responsePayload);

    res.json(responsePayload);
  } catch (error) {
    console.error('Word lookup error:', error);
    res.status(500).json({ message: 'Error retrieving word details' });
  }
};
