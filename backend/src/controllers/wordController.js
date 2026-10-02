// @desc    Lookup English definition, example sentence, and Hindi translation
// @route   GET /api/words/lookup?word=...
// @access  Public (or Protected)
export const lookupWord = async (req, res) => {
  try {
    const rawWord = req.query.word;

    if (!rawWord || typeof rawWord !== 'string') {
      return res.status(400).json({ message: 'Word parameter is required' });
    }

    // Clean word: trim and strip surrounding punctuation
    const word = rawWord.trim().replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();

    if (!word || !/^[a-zA-Z]+(?:[''-][a-zA-Z]+)*$/.test(word)) {
      return res.status(400).json({ message: 'Please provide a valid single English word' });
    }

    // Fetch Dictionary API & Translation API in parallel
    const [dictResult, transResult] = await Promise.allSettled([
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`).then((r) =>
        r.json()
      ),
      fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|hi`).then((r) =>
        r.json()
      ),
    ]);

    let definition = '';
    let exampleSentence = '';
    let phonetic = '';
    let partOfSpeech = '';

    // Process Dictionary API response
    if (dictResult.status === 'fulfilled' && Array.isArray(dictResult.value) && dictResult.value.length > 0) {
      const entry = dictResult.value[0];
      phonetic = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '';

      if (entry.meanings && entry.meanings.length > 0) {
        const meaning = entry.meanings[0];
        partOfSpeech = meaning.partOfSpeech || '';

        // Find definition
        if (meaning.definitions && meaning.definitions.length > 0) {
          definition = meaning.definitions[0].definition || '';

          // Find first available example sentence across definitions
          for (const m of entry.meanings) {
            for (const d of m.definitions) {
              if (d.example) {
                exampleSentence = d.example;
                break;
              }
            }
            if (exampleSentence) break;
          }
        }
      }
    }

    // Process Translation API response
    let hindiMeaning = '';
    if (transResult.status === 'fulfilled' && transResult.value?.responseData?.translatedText) {
      hindiMeaning = transResult.value.responseData.translatedText;
      // Filter out raw query echo if translation returned the same word
      if (hindiMeaning.toLowerCase() === word.toLowerCase()) {
        hindiMeaning = '';
      }
    }

    if (!definition && !hindiMeaning) {
      return res.status(404).json({
        message: `No definition found for "${word}"`,
        word,
      });
    }

    res.json({
      word,
      phonetic,
      partOfSpeech,
      definition: definition || 'Definition not available.',
      hindiMeaning: hindiMeaning || 'Translation not available.',
      exampleSentence: exampleSentence || `The word "${word}" can be used in your reading vocabulary.`,
    });
  } catch (error) {
    console.error('Word lookup error:', error);
    res.status(500).json({ message: 'Error retrieving word details' });
  }
};
