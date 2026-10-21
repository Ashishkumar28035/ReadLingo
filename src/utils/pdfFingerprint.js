/**
 * Generates a reliable, collision-resistant identifier for a locally selected PDF.
 * Avoids uploading the file to the server.
 *
 * Strategy:
 * 1. Primary: Use PDF.js doc.fingerprints[0] (the standard ISO 32000-1 permanent PDF identifier).
 * 2. Fallback: Compute client-side SHA-256 hash of the PDF binary arrayBuffer via Web Crypto API.
 * 3. Ultimate Fallback: Deterministic byte sampling if Web Crypto is unavailable.
 */
export async function computePdfFingerprint(doc, arrayBuffer) {
  // 1. Inspect PDF.js document fingerprints
  if (doc?.fingerprints && Array.isArray(doc.fingerprints) && doc.fingerprints[0]) {
    const fp = String(doc.fingerprints[0]).trim();
    if (fp.length >= 8) {
      return `pdf_${fp}`;
    }
  }

  if (doc?.fingerprint && typeof doc.fingerprint === 'string') {
    const fp = doc.fingerprint.trim();
    if (fp.length >= 8) {
      return `pdf_${fp}`;
    }
  }

  // 2. Client-side SHA-256 via Web Crypto API
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && arrayBuffer) {
    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `sha256_${hashHex}`;
    } catch (err) {
      console.warn('[ReadLingo] Web Crypto hashing fallback:', err);
    }
  }

  // 3. Fallback: Fast deterministic byte-sampling hash
  if (arrayBuffer && arrayBuffer.byteLength) {
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.length;
    let sampleHash = 0;
    const step = Math.max(1, Math.floor(len / 100));
    for (let i = 0; i < len; i += step) {
      sampleHash = (sampleHash * 31 + bytes[i]) >>> 0;
    }
    return `sample_${len}_${sampleHash.toString(16)}`;
  }

  return `doc_${doc?.numPages || 0}_${Date.now()}`;
}
