/**
 * Grammar Checking Controller
 * Proxies sentence grammar verification requests to LanguageTool API
 * with defensive timeouts, in-memory caching, sanitization, and graceful degradation.
 */

// In-memory cache for grammar checks: normalizedText -> { result, timestamp }
const grammarCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 500;
const TIMEOUT_MS = 4000; // 4 second timeout for external API

function getCachedResult(text) {
  const key = text.trim().toLowerCase();
  const entry = grammarCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    grammarCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResult(text, data) {
  const key = text.trim().toLowerCase();
  if (grammarCache.size >= MAX_CACHE_SIZE) {
    const oldest = grammarCache.keys().next().value;
    if (oldest) grammarCache.delete(oldest);
  }
  grammarCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * POST /api/words/check-grammar
 * Body: { text: string, targetWord?: string }
 */
export async function checkSentenceGrammar(req, res) {
  try {
    const { text, targetWord: _targetWord } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Sentence text is required.',
      });
    }

    const cleanText = text.trim();
    if (cleanText.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Sentence text must not exceed 1000 characters.',
      });
    }

    // Check cache first
    const cached = getCachedResult(cleanText);
    if (cached) {
      return res.json({
        success: true,
        ...cached,
        cached: true,
      });
    }

    // Call LanguageTool Public API
    let response;
    try {
      const bodyParams = new URLSearchParams();
      bodyParams.append('text', cleanText);
      bodyParams.append('language', 'en-US');

      response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'ReadLingo-App/1.0',
        },
        body: bodyParams,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Timeout, DNS, or network failure -> Return unavailable without failing overall request
      return res.json({
        success: true,
        grammarStatus: 'unavailable',
        matches: [],
        matchCount: 0,
        message: 'Word usage detected; grammar could not be checked.',
      });
    }

    if (!response.ok) {
      // 429 rate limit or 5xx service outage -> Return unavailable
      return res.json({
        success: true,
        grammarStatus: 'unavailable',
        matches: [],
        matchCount: 0,
        message: 'Word usage detected; grammar could not be checked.',
      });
    }

    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.matches)) {
      return res.json({
        success: true,
        grammarStatus: 'unavailable',
        matches: [],
        matchCount: 0,
        message: 'Word usage detected; grammar could not be checked.',
      });
    }

    // Filter and format relevant grammar/spelling matches
    // Ignore purely cosmetic or typographical rules like WHITESPACE_RULE if desired,
    // but keep grammatical, agreement, syntax, and spelling errors.
    const relevantMatches = data.matches.filter((m) => {
      const ruleId = m.rule?.id || '';
      // We can ignore pure multiple spaces rule if user typed extra spaces
      if (ruleId === 'WHITESPACE_RULE') return false;
      return true;
    });

    const formattedMatches = relevantMatches.map((m) => {
      const replacements = (m.replacements || [])
        .slice(0, 3)
        .map((r) => r.value)
        .filter(Boolean);

      return {
        message: m.message || 'Grammar or syntax issue detected.',
        shortMessage: m.shortMessage || '',
        offset: typeof m.offset === 'number' ? m.offset : 0,
        length: typeof m.length === 'number' ? m.length : 0,
        replacements,
        ruleId: m.rule?.id || '',
        ruleDescription: m.rule?.description || '',
        category: m.rule?.category?.name || 'Grammar',
      };
    });

    let result;
    if (formattedMatches.length === 0) {
      result = {
        grammarStatus: 'passed',
        matches: [],
        matchCount: 0,
        message: 'Sentence passed grammar checks with no issues detected.',
      };
    } else {
      result = {
        grammarStatus: 'grammar_issue',
        matches: formattedMatches,
        matchCount: formattedMatches.length,
        message: formattedMatches[0]?.message || 'Grammar issue detected.',
      };
    }

    setCachedResult(cleanText, result);

    return res.json({
      success: true,
      ...result,
      cached: false,
    });
  } catch {
    // Top-level fallback: never fail silently to 'passed'
    return res.json({
      success: true,
      grammarStatus: 'unavailable',
      matches: [],
      matchCount: 0,
      message: 'Word usage detected; grammar could not be checked.',
    });
  }
}
