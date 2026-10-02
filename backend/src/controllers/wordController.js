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
        phonetic = entry.phonetic || entry.phonetics?.find((p) => p.text && p.text.trim())?.text || '';
      }
      if (Array.isArray(entry.meanings)) {
        for (const m of entry.meanings) {
          if (!partOfSpeech && m.partOfSpeech) {
            partOfSpeech = m.partOfSpeech;
          }
          if (Array.isArray(m.definitions)) {
            for (const d of m.definitions) {
              if (!definition && d?.definition && typeof d.definition === 'string' && d.definition.trim()) {
                definition = d.definition.trim();
              }
              if (!example && d?.example && typeof d.example === 'string' && d.example.trim()) {
                example = d.example.trim();
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
        partOfSpeech = item.partOfSpeech.toLowerCase();
      }
      if (Array.isArray(item.definitions)) {
        for (const d of item.definitions) {
          if (!definition && d.definition) {
            const rawDef = d.definition.replace(/<[^>]+>/g, '').trim();
            if (rawDef && !rawDef.toLowerCase().startsWith('misspelling')) {
              definition = rawDef;
            }
          }
          if (!example) {
            const rawEx =
              d.parsedExamples?.[0]?.example?.replace(/<[^>]+>/g, '').trim() ||
              d.examples?.[0]?.replace(/<[^>]+>/g, '').trim() ||
              '';
            if (rawEx) {
              example = rawEx;
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
            const defText = parts.slice(1).join('\t').trim();
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

    let trans = data.responseData?.translatedText || '';

    // Ignore quota warning messages
    if (typeof trans !== 'string' || trans.includes('MYMEMORY WARNING:') || trans.includes('QUERY LENGTH LIMIT')) {
      trans = '';
    }

    // Fallback to matches if responseData was empty
    if (!trans && Array.isArray(data.matches)) {
      for (const m of data.matches) {
        if (
          m.translation &&
          typeof m.translation === 'string' &&
          !m.translation.includes('MYMEMORY WARNING:') &&
          m.translation.toLowerCase() !== term.toLowerCase()
        ) {
          trans = m.translation;
          break;
        }
      }
    }

    if (!trans) return '';

    // Decode HTML entities
    trans = trans
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    // Clean surrounding quotes
    trans = trans.replace(/^["'“‘]+|["'”’]+$/g, '').trim();

    // If translation is the raw English word, ignore
    if (trans.toLowerCase() === term.toLowerCase()) {
      return '';
    }

    return trans;
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

    if (!word || !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word)) {
      return res.status(400).json({ message: 'Please provide a valid single English word' });
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

    const definition = dictData?.definition?.trim() || 'Definition not available.';
    const phonetic = dictData?.phonetic?.trim() || '';
    const partOfSpeech = dictData?.partOfSpeech?.trim() || '';
    const exampleSentence = dictData?.example?.trim() || 'Example not available.';
    const hindiMeaning = rawHindi?.trim() || 'Translation not available.';

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
