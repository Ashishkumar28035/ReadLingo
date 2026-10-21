import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePdfFingerprint } from '../../src/utils/pdfFingerprint.js';

describe('PDF Client-Side Fingerprinting Suite', () => {
  test('1. Uses doc.fingerprints[0] if available from PDF.js', async () => {
    const mockDoc = {
      fingerprints: ['7b2f9a1c8d0e3f4a5b6c7d8e9f0a1b2c', '7b2f9a1c8d0e3f4a5b6c7d8e9f0a1b2c'],
      numPages: 25,
    };
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;

    const fp = await computePdfFingerprint(mockDoc, buffer);
    assert.equal(fp, 'pdf_7b2f9a1c8d0e3f4a5b6c7d8e9f0a1b2c');
  });

  test('2. Uses doc.fingerprint if fingerprints array is missing', async () => {
    const mockDoc = {
      fingerprint: 'fedcba9876543210',
      numPages: 10,
    };
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;

    const fp = await computePdfFingerprint(mockDoc, buffer);
    assert.equal(fp, 'pdf_fedcba9876543210');
  });

  test('3. Computes SHA-256 content hash if doc has no PDF.js fingerprints', async () => {
    const mockDoc = { numPages: 5 };
    const content = new TextEncoder().encode('ReadLingo Test PDF Content 12345');
    const buffer = content.buffer;

    const fp1 = await computePdfFingerprint(mockDoc, buffer);
    const fp2 = await computePdfFingerprint(mockDoc, buffer);

    assert.ok(fp1.startsWith('sha256_') || fp1.startsWith('sample_'));
    assert.equal(fp1, fp2, 'Identical PDF bytes must produce identical fingerprint');
  });

  test('4. Different PDF bytes produce different fingerprints', async () => {
    const mockDoc = { numPages: 5 };
    const bufferA = new TextEncoder().encode('Document Alpha').buffer;
    const bufferB = new TextEncoder().encode('Document Beta').buffer;

    const fpA = await computePdfFingerprint(mockDoc, bufferA);
    const fpB = await computePdfFingerprint(mockDoc, bufferB);

    assert.notEqual(fpA, fpB, 'Different documents must have different identifiers');
  });

  test('5. Graceful fallback on empty/missing doc and buffer', async () => {
    const fp = await computePdfFingerprint(null, null);
    assert.ok(typeof fp === 'string' && fp.length > 0);
  });
});
