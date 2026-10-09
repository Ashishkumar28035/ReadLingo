/**
 * Practice Mode Utility Functions
 * Pure helper functions for question generation, option randomization,
 * distractor filtering, sentence validation, and accuracy calculation.
 */

/**
 * Fisher-Yates array shuffle (immutable copy)
 */
export function shuffleArray(arr) {
  if (!Array.isArray(arr)) return [];
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Cleans definitions, examples, and HTML tags for UI display
 */
export function formatDisplayText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\.mw-parser-output[^{}]*\{[^}]*\}/gi, '')
    .replace(/\{[a-zA-Z\-_\s]+:[^}]+\}/gi, '')
    .replace(/\.defdate\s*\{[^}]*\}/gi, '')
    .replace(/\.mw-[a-zA-Z0-9_-]+/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes and formats Hindi meanings for display and options comparison.
 * Strictly verifies presence of Devanagari script; returns empty string if no Hindi text exists.
 */
export function formatDisplayHindi(raw, term = '') {
  if (!raw || typeof raw !== 'string') return '';
  let str = formatDisplayText(raw);
  if (/[\u0900-\u097F]/.test(str)) {
    str = str.replace(/([\u0900-\u097F])[a-zA-Z].*$/, '$1');
    str = str.replace(/[a-zA-Z0-9_\-.:#@]+/g, '');
    str = str.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');
    str = str.replace(/^[\s,./|\-–—:]+|[\s,./|\-–—:]+$/g, '').trim();
    if (term && str.toLowerCase() === term.toLowerCase()) return '';
    return str;
  }
  return '';
}

/**
 * Known irregular verb and inflection families (canonical groupings)
 */
const IRREGULAR_FAMILIES = [
  ['share', 'shares', 'shared', 'sharing'],
  ['read', 'reads', 'reading'],
  ['write', 'writes', 'writing', 'wrote', 'written'],
  ['speak', 'speaks', 'speaking', 'spoke', 'spoken'],
  ['take', 'takes', 'taking', 'took', 'taken'],
  ['make', 'makes', 'making', 'made'],
  ['go', 'goes', 'going', 'went', 'gone'],
  ['see', 'sees', 'seeing', 'saw', 'seen'],
  ['know', 'knows', 'knowing', 'knew', 'known'],
  ['think', 'thinks', 'thinking', 'thought'],
  ['give', 'gives', 'giving', 'gave', 'given'],
  ['find', 'finds', 'finding', 'found'],
  ['tell', 'tells', 'telling', 'told'],
  ['become', 'becomes', 'becoming', 'became'],
  ['leave', 'leaves', 'leaving', 'left'],
  ['feel', 'feels', 'feeling', 'felt'],
  ['put', 'puts', 'putting'],
  ['bring', 'brings', 'bringing', 'brought'],
  ['begin', 'begins', 'beginning', 'began', 'begun'],
  ['keep', 'keeps', 'keeping', 'kept'],
  ['hold', 'holds', 'holding', 'held'],
  ['stand', 'stands', 'standing', 'stood'],
  ['hear', 'hears', 'hearing', 'heard'],
  ['let', 'lets', 'letting'],
  ['mean', 'means', 'meaning', 'meant'],
  ['set', 'sets', 'setting'],
  ['meet', 'meets', 'meeting', 'met'],
  ['run', 'runs', 'running', 'ran'],
  ['pay', 'pays', 'paying', 'paid'],
  ['sit', 'sits', 'sitting', 'sat'],
  ['lie', 'lies', 'lying', 'lay', 'lain'],
  ['lead', 'leads', 'leading', 'led'],
  ['understand', 'understands', 'understanding', 'understood'],
  ['grow', 'grows', 'growing', 'grew', 'grown'],
  ['lose', 'loses', 'losing', 'lost'],
  ['fall', 'falls', 'falling', 'fell', 'fallen'],
  ['send', 'sends', 'sending', 'sent'],
  ['build', 'builds', 'building', 'built'],
  ['draw', 'draws', 'drawing', 'drew', 'drawn'],
  ['break', 'breaks', 'breaking', 'broke', 'broken'],
  ['spend', 'spends', 'spending', 'spent'],
  ['cut', 'cuts', 'cutting'],
  ['rise', 'rises', 'rising', 'rose', 'risen'],
  ['drive', 'drives', 'driving', 'drove', 'driven'],
  ['buy', 'buys', 'buying', 'bought'],
  ['wear', 'wears', 'wearing', 'wore', 'worn'],
  ['choose', 'chooses', 'choosing', 'chose', 'chosen'],
];

/**
 * Returns legitimate grammatical inflections / word family members for a target word.
 * Preserves deliberate word-category distinctions (e.g. 'immediate' does NOT include 'immediately').
 *
 * @param {string} rawWord - The target word
 * @returns {string[]} Array of accepted word family forms
 */
export function getWordFamily(rawWord) {
  if (!rawWord || typeof rawWord !== 'string') return [];
  const word = rawWord.trim().toLowerCase();
  if (!word) return [];

  for (const fam of IRREGULAR_FAMILIES) {
    if (fam.includes(word)) {
      return Array.from(new Set([word, ...fam]));
    }
  }

  const bases = new Set();
  if (word.endsWith('ing') && word.length > 4) {
    bases.add(word.slice(0, -3));
    bases.add(word.slice(0, -3) + 'e');
    if (word.length > 5 && word[word.length - 4] === word[word.length - 5]) {
      bases.add(word.slice(0, -4));
    }
  } else if (word.endsWith('ed') && word.length > 3) {
    bases.add(word.slice(0, -2));
    bases.add(word.slice(0, -1));
    if (word.endsWith('ied') && word.length > 4) {
      bases.add(word.slice(0, -3) + 'y');
    }
  } else if (word.endsWith('es') && word.length > 4) {
    bases.add(word.slice(0, -2));
    bases.add(word.slice(0, -1));
  } else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    bases.add(word.slice(0, -1));
  } else {
    bases.add(word);
  }

  const forms = new Set([word]);
  for (const b of bases) {
    if (b.length < 2) continue;
    forms.add(b);
    if (b.endsWith('e')) {
      forms.add(b + 's');
      forms.add(b + 'd');
      forms.add(b.slice(0, -1) + 'ing');
    } else if (b.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(b[b.length - 2])) {
      forms.add(b.slice(0, -1) + 'ies');
      forms.add(b.slice(0, -1) + 'ied');
      forms.add(b + 'ing');
    } else if (b.endsWith('sh') || b.endsWith('ch') || b.endsWith('ss') || b.endsWith('x')) {
      forms.add(b + 'es');
      forms.add(b + 'ed');
      forms.add(b + 'ing');
    } else {
      forms.add(b + 's');
      forms.add(b + 'ed');
      forms.add(b + 'ing');
    }
  }

  return Array.from(forms);
}

/**
 * Curated contextual examples for known vocabulary and contextual generator fallback.
 */
const CONTEXTUAL_EXAMPLES = {
  sharing: 'We believe that sharing knowledge helps everyone grow.',
  share: 'I do not want to share anything with you.',
  immediate: 'The team took immediate action to resolve the critical issue.',
  accomplish: 'With consistent practice, you can accomplish your goals.',
  structure: 'The ancient building has a very strong and durable structure.',
  communication: 'Clear communication is essential for effective teamwork.',
  multiple: 'She provided multiple solutions to the difficult problem.',
  clustered: 'The stars were clustered brightly in the night sky.',
  cluster: 'A dense cluster of trees stood at the edge of the forest.',
  abstraction: 'Clean software architecture relies on well-designed layers of abstraction.',
  read: 'I read insightful books every morning to learn new ideas.',
  book: 'She bought an interesting book from the local store.',
  learn: 'Curious students love to learn new skills every day.',
};

/**
 * Returns a valid contextual reference example sentence for a given word.
 *
 * @param {string} rawWord - The target word
 * @param {string} [definition] - Optional word definition
 * @returns {string} Natural reference sentence
 */
export function getContextualExample(rawWord, _definition = '') {
  if (!rawWord || typeof rawWord !== 'string') return '';
  const word = rawWord.trim().toLowerCase();

  if (CONTEXTUAL_EXAMPLES[word]) {
    return CONTEXTUAL_EXAMPLES[word];
  }

  // Derive if a word family member has a curated example
  for (const form of getWordFamily(word)) {
    if (CONTEXTUAL_EXAMPLES[form]) {
      return CONTEXTUAL_EXAMPLES[form];
    }
  }

  const cleanWord = rawWord.trim();
  return `They demonstrated how the word "${cleanWord}" is used in a complete sentence.`;
}

/**
 * Validates that an English sentence input is non-empty and uses the target word
 * or an accepted word-family form as an independent, discrete word (case-insensitively).
 * Strictly avoids false positives where target word appears only as a substring
 * of another word (e.g. 'immediate' in 'immediately', or 'read' in 'treadmill').
 *
 * @param {string} sentence - The submitted sentence
 * @param {string} targetWord - The target word required
 * @param {Object} [options] - Options
 * @param {boolean} [options.allowWordFamily=true] - Whether legitimate word inflections are accepted
 * @returns {{
 *   isValid: boolean,
 *   reason: string,
 *   matchedForm: string,
 *   isExact: boolean,
 *   isWordFamily: boolean,
 *   acceptedForms: string[],
 *   message: string
 * }}
 */
export function validateSentenceWordUsage(sentence, targetWord, options = { allowWordFamily: false }) {
  if (!sentence || typeof sentence !== 'string' || !sentence.trim()) {
    return {
      isValid: false,
      reason: 'empty',
      matchedForm: '',
      isExact: false,
      isWordFamily: false,
      acceptedForms: [],
      message: 'Please write a sentence before submitting.',
    };
  }

  if (!targetWord || typeof targetWord !== 'string' || !targetWord.trim()) {
    return {
      isValid: false,
      reason: 'missing_target',
      matchedForm: '',
      isExact: false,
      isWordFamily: false,
      acceptedForms: [],
      message: 'Target word is missing.',
    };
  }

  const cleanSentence = sentence.trim();
  const cleanTarget = targetWord.trim();
  const words = cleanSentence.split(/\s+/).filter(Boolean);

  // Guard against user just typing the single word alone or incomplete sentence
  if (words.length === 1) {
    return {
      isValid: false,
      reason: 'single_word_only',
      matchedForm: '',
      isExact: false,
      isWordFamily: false,
      acceptedForms: [],
      message: `Please write a complete sentence using "${cleanTarget}", rather than just the word alone.`,
    };
  }

  // 1. Check exact target word first
  const escapedTarget = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapedTarget}([^a-zA-Z0-9]|$)`, 'i');

  if (exactRegex.test(cleanSentence)) {
    return {
      isValid: true,
      reason: 'ok',
      matchedForm: cleanTarget,
      isExact: true,
      isWordFamily: false,
      acceptedForms: [cleanTarget],
      message: `Target word "${cleanTarget}" was included.`,
    };
  }

  // 2. Check accepted word forms if allowed by word-family policy
  const allowFamily = Boolean(options?.allowWordFamily);
  const acceptedForms = allowFamily ? getWordFamily(cleanTarget) : [cleanTarget];

  if (allowFamily) {
    for (const form of acceptedForms) {
      if (form.toLowerCase() === cleanTarget.toLowerCase()) continue;
      const escapedForm = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const formRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapedForm}([^a-zA-Z0-9]|$)`, 'i');

      if (formRegex.test(cleanSentence)) {
        return {
          isValid: true,
          reason: 'word_family_matched',
          matchedForm: form,
          isExact: false,
          isWordFamily: true,
          acceptedForms,
          message: `Accepted word form "${form}" was used for "${cleanTarget}".`,
        };
      }
    }
  }

  const displayForms = allowFamily && acceptedForms.length > 1
    ? ` or an accepted form (${acceptedForms.join(', ')})`
    : '';

  return {
    isValid: false,
    reason: 'missing_target_word',
    matchedForm: '',
    isExact: false,
    isWordFamily: false,
    acceptedForms,
    message: `Your sentence does not contain "${cleanTarget}"${displayForms} as a separate word.`,
  };
}

/**
 * Calculates accuracy percentage safely without dividing by zero.
 */
export function calculateAccuracy(correctCount, totalCount) {
  if (!totalCount || totalCount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((correctCount / totalCount) * 100)));
}

/**
 * Calculates how many eligible MCQ questions can be generated from saved words.
 */
export function getEligibleMcqCount(savedWords) {
  if (!Array.isArray(savedWords) || savedWords.length === 0) return 0;
  return generateMcqQuestions(savedWords, Infinity).length;
}

/**
 * Generates MCQ questions from a user's saved vocabulary.
 * Guarantees:
 * - 4 distinct answer options per question (1 correct, 3 distractors)
 * - Distractors chosen strictly from the user's other saved words
 * - Never shows duplicate options
 * - Skips questions where 4 reliable, distinct options cannot be constructed
 * - Randomizes options position
 * - Supports both English->Hindi and Hindi->English question types
 *
 * @param {Array<Object>} savedWords - List of saved vocabulary items
 * @param {number} questionCount - Desired question count (or Infinity for all)
 * @returns {Array<Object>} Array of ready-to-render MCQ questions
 */
export function generateMcqQuestions(savedWords, questionCount = 10) {
  if (!Array.isArray(savedWords) || savedWords.length === 0) {
    return [];
  }

  // 1. Filter items with valid word and non-empty clean Hindi meaning
  const validItems = [];
  for (const item of savedWords) {
    if (!item?.word) continue;
    const cleanWord = item.word.trim();
    const cleanHindi = formatDisplayHindi(item.hindiMeaning, cleanWord);
    // Must contain Devanagari script to be a true Hindi translation
    if (cleanWord && cleanHindi && /[\u0900-\u097F]/.test(cleanHindi)) {
      validItems.push({
        ...item,
        cleanWord,
        cleanHindi,
      });
    }
  }

  // De-duplicate valid items by lowercase word (in case duplicate words were saved)
  const uniqueItemsByWord = Array.from(
    new Map(validItems.map((item) => [item.cleanWord.toLowerCase(), item])).values()
  );

  // Need at least 4 items with distinct words to form a 4-choice MCQ
  if (uniqueItemsByWord.length < 4) {
    return [];
  }

  // Distinct Hindi meanings and distinct words collections
  const uniqueHindiMeanings = Array.from(
    new Set(uniqueItemsByWord.map((v) => v.cleanHindi))
  );
  const uniqueWords = Array.from(
    new Set(uniqueItemsByWord.map((v) => v.cleanWord))
  );

  // Shuffle items for randomized question order
  const shuffledCandidates = shuffleArray(uniqueItemsByWord);
  const questions = [];
  const limit = Math.min(questionCount, shuffledCandidates.length);

  for (let i = 0; i < shuffledCandidates.length && questions.length < limit; i++) {
    const current = shuffledCandidates[i];

    // Determine viable question types for this specific candidate
    const canDoWordToHindi =
      uniqueHindiMeanings.filter(
        (h) => h.toLowerCase() !== current.cleanHindi.toLowerCase()
      ).length >= 3;

    const canDoHindiToWord =
      uniqueWords.filter(
        (w) => w.toLowerCase() !== current.cleanWord.toLowerCase()
      ).length >= 3;

    if (!canDoWordToHindi && !canDoHindiToWord) {
      continue;
    }

    // Prefer alternating, but fallback to whichever type is viable
    let preferredType = questions.length % 2 === 0 ? 'word_to_hindi' : 'hindi_to_word';
    if (preferredType === 'word_to_hindi' && !canDoWordToHindi) {
      preferredType = 'hindi_to_word';
    } else if (preferredType === 'hindi_to_word' && !canDoHindiToWord) {
      preferredType = 'word_to_hindi';
    }

    if (preferredType === 'word_to_hindi') {
      const correctAnswer = current.cleanHindi;
      const otherMeanings = uniqueHindiMeanings.filter(
        (h) => h.toLowerCase() !== correctAnswer.toLowerCase()
      );
      const distractors = shuffleArray(otherMeanings).slice(0, 3);
      const options = shuffleArray([correctAnswer, ...distractors]);

      questions.push({
        id: `mcq-${current._id || i}-${Date.now()}-${questions.length}`,
        type: 'word_to_hindi',
        prompt: current.cleanWord,
        promptLabel: 'What is the Hindi meaning of this word?',
        correctAnswer,
        options,
        originalWord: current,
      });
    } else {
      const correctAnswer = current.cleanWord;
      const otherWords = uniqueWords.filter(
        (w) => w.toLowerCase() !== correctAnswer.toLowerCase()
      );
      const distractors = shuffleArray(otherWords).slice(0, 3);
      const options = shuffleArray([correctAnswer, ...distractors]);

      questions.push({
        id: `mcq-${current._id || i}-${Date.now()}-${questions.length}`,
        type: 'hindi_to_word',
        prompt: current.cleanHindi,
        promptLabel: 'Which English word matches this Hindi meaning?',
        correctAnswer,
        options,
        originalWord: current,
      });
    }
  }

  return questions;
}
