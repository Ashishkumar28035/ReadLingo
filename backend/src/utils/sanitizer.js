/**
 * Sanitizer utility for dictionary lookups, translations, and vocabulary entries.
 * Strips HTML, CSS fragments, Wiktionary parser artifacts, and leaks.
 */

export function cleanEnglishText(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text;

  // 1. Remove style and script blocks with their contents
  str = str.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  str = str.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Remove leaked CSS rules, class declarations, and parser output fragments
  str = str.replace(/\.mw-parser-output[^{}]*\{[^}]*\}/gi, '');
  str = str.replace(/\{[a-zA-Z\-_\s]+:[^}]+\}/gi, '');
  str = str.replace(/\.defdate\s*\{[^}]*\}/gi, '');
  str = str.replace(/\.mw-[a-zA-Z0-9_-]+/gi, '');

  // 3. Decode common HTML entities
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  // 4. Strip all remaining HTML tags
  str = str.replace(/<[^>]+>/g, '');

  // 5. Remove mediawiki templates {{...}} and unwrap wiki links [[...]]
  str = str.replace(/\{\{[^}]*\}\}/g, '');
  str = str.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');

  // 6. Clean dangling wiki/ellipsis brackets e.g. "[…]" or "[...]"
  str = str.replace(/\[\s*…\s*\]/g, '');
  str = str.replace(/\[\s*\.\.\.\s*\]/g, '');

  // 7. Normalize repeated whitespace
  str = str.replace(/\s+/g, ' ').trim();

  // 8. Clean redundant space before punctuation
  str = str.replace(/\s+([.,;:!?])/g, '$1');

  // 9. Remove outer quotes if the entire string is wrapped in quotes
  str = str.replace(/^["'“‘]+|["'”’]+$/g, '').trim();

  return str;
}

export function cleanHindiText(raw, term = '') {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw;

  // 1. Remove style and script blocks
  str = str.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  str = str.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Remove leaked CSS or parser output
  str = str.replace(/\.mw-parser-output[^{}]*\{[^}]*\}/gi, '');
  str = str.replace(/\{[a-zA-Z\-_\s]+:[^}]+\}/gi, '');
  str = str.replace(/\.defdate\s*\{[^}]*\}/gi, '');
  str = str.replace(/\.mw-[a-zA-Z0-9_-]+/gi, '');

  // 3. Decode HTML entities
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  // 4. Strip HTML tags
  str = str.replace(/<[^>]+>/g, '');

  // 5. Clean outer quotes
  str = str.replace(/^["'“‘]+|["'”’]+$/g, '').trim();

  // 6. If there are Devanagari characters:
  const hasDevanagari = /[\u0900-\u097F]/.test(str);
  if (hasDevanagari) {
    // If Latin text was glued directly after Devanagari (e.g. 'अनेकthe star is a variable star')
    str = str.replace(/([\u0900-\u097F])[a-zA-Z].*$/, '$1');

    // Remove any remaining English/Latin words leaking into the Hindi translation
    str = str.replace(/[a-zA-Z0-9_\-.:#@]+/g, '');

    // Clean residual empty brackets like '()' or '[]'
    str = str.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');

    // Clean surrounding punctuation
    str = str.replace(/^[\s,./|\-–—:]+|[\s,./|\-–—:]+$/g, '').trim();
  }

  // If translation is empty or simply the raw English word, ignore
  if (!str || (term && str.toLowerCase() === term.toLowerCase())) {
    return '';
  }

  return str.replace(/\s+/g, ' ').trim();
}
