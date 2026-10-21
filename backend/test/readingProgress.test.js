import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import User from '../src/models/User.js';
import ReadingProgress from '../src/models/ReadingProgress.js';
import { signup } from '../src/controllers/authController.js';
import {
  saveProgress,
  getProgress,
  getAllProgress,
  deleteProgress,
} from '../src/controllers/progressController.js';

// Helper to simulate Express req/res
function createMockReqRes({ body = {}, headers = {}, params = {}, query = {}, user = null } = {}) {
  const req = {
    body,
    headers,
    params,
    query,
    user,
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('Reading Progress & Bookmark Feature Test Suite', () => {
  const TS = Date.now();
  const USER_A_EMAIL = `prog-test-a-${TS}@example.com`;
  const USER_A_PASS = 'ProgressPass123!';
  const USER_B_EMAIL = `prog-test-b-${TS}@example.com`;
  const USER_B_PASS = 'ProgressPass456!';

  let userA = null;
  let userB = null;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/readlingo';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: 'readlingo', family: 4 });
    }

    // Clean up any old test documents
    await ReadingProgress.deleteMany({
      documentId: { $regex: /^test-doc-/ },
    });

    // Create User A
    const mockA = createMockReqRes({
      body: { name: 'Prog User A', email: USER_A_EMAIL, password: USER_A_PASS },
    });
    await signup(mockA.req, mockA.res);
    assert.equal(mockA.getStatus(), 201);
    userA = { _id: new mongoose.Types.ObjectId(mockA.getData()._id) };

    // Create User B
    const mockB = createMockReqRes({
      body: { name: 'Prog User B', email: USER_B_EMAIL, password: USER_B_PASS },
    });
    await signup(mockB.req, mockB.res);
    assert.equal(mockB.getStatus(), 201);
    userB = { _id: new mongoose.Types.ObjectId(mockB.getData()._id) };
  });

  after(async () => {
    await ReadingProgress.deleteMany({
      documentId: { $regex: /^test-doc-/ },
    });
    await User.deleteMany({
      email: { $regex: /^prog-test-/ },
    });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('1. Save progress creates a new record with correct metadata', async () => {
    const docId = `test-doc-1-${TS}`;
    const mock = createMockReqRes({
      user: userA,
      body: {
        documentId: docId,
        pageNumber: 5,
        totalPages: 42,
        title: 'Moby Dick.pdf',
      },
    });

    await saveProgress(mock.req, mock.res);
    assert.equal(mock.getStatus(), 200);

    const data = mock.getData();
    assert.equal(data.message, 'Reading progress saved successfully');
    assert.equal(data.progress.documentId, docId);
    assert.equal(data.progress.pageNumber, 5);
    assert.equal(data.progress.totalPages, 42);
    assert.equal(data.progress.title, 'Moby Dick.pdf');
    assert.ok(data.progress.updatedAt);
  });

  test('2. Reselecting the same PDF retrieves that user saved progress', async () => {
    const docId = `test-doc-1-${TS}`;
    const mock = createMockReqRes({
      user: userA,
      params: { documentId: docId },
    });

    await getProgress(mock.req, mock.res);
    assert.equal(mock.getStatus(), 200);

    const data = mock.getData();
    assert.ok(data.progress);
    assert.equal(data.progress.documentId, docId);
    assert.equal(data.progress.pageNumber, 5);
    assert.equal(data.progress.totalPages, 42);
  });

  test('3. Saving new page for the same PDF upserts without duplicate records', async () => {
    const docId = `test-doc-1-${TS}`;

    // Update to page 19
    const mock = createMockReqRes({
      user: userA,
      body: {
        documentId: docId,
        pageNumber: 19,
        totalPages: 42,
        title: 'Moby Dick.pdf',
      },
    });

    await saveProgress(mock.req, mock.res);
    assert.equal(mock.getStatus(), 200);
    assert.equal(mock.getData().progress.pageNumber, 19);

    // Verify in database that exactly ONE record exists for this user and document
    const count = await ReadingProgress.countDocuments({
      userId: userA._id,
      documentId: docId,
    });
    assert.equal(count, 1, 'Upsert must prevent duplicate records for same user & document');

    const record = await ReadingProgress.findOne({
      userId: userA._id,
      documentId: docId,
    });
    assert.equal(record.pageNumber, 19);
  });

  test('4. Different PDFs do not share progress', async () => {
    const docIdA = `test-doc-alpha-${TS}`;
    const docIdB = `test-doc-beta-${TS}`;

    // Save Doc Alpha at page 12
    const mockA = createMockReqRes({
      user: userA,
      body: { documentId: docIdA, pageNumber: 12, totalPages: 50 },
    });
    await saveProgress(mockA.req, mockA.res);
    assert.equal(mockA.getStatus(), 200);

    // Save Doc Beta at page 3
    const mockB = createMockReqRes({
      user: userA,
      body: { documentId: docIdB, pageNumber: 3, totalPages: 10 },
    });
    await saveProgress(mockB.req, mockB.res);
    assert.equal(mockB.getStatus(), 200);

    // Verify Doc Alpha is still at page 12
    const checkA = createMockReqRes({
      user: userA,
      params: { documentId: docIdA },
    });
    await getProgress(checkA.req, checkA.res);
    assert.equal(checkA.getData().progress.pageNumber, 12);

    // Verify Doc Beta is at page 3
    const checkB = createMockReqRes({
      user: userA,
      params: { documentId: docIdB },
    });
    await getProgress(checkB.req, checkB.res);
    assert.equal(checkB.getData().progress.pageNumber, 3);
  });

  test('5. Multi-user isolation: User B cannot read or modify User A progress', async () => {
    const docId = `test-doc-isolated-${TS}`;

    // User A saves progress at page 27
    const mockSaveA = createMockReqRes({
      user: userA,
      body: { documentId: docId, pageNumber: 27, totalPages: 100 },
    });
    await saveProgress(mockSaveA.req, mockSaveA.res);
    assert.equal(mockSaveA.getStatus(), 200);

    // User B queries progress for the exact same document
    const mockGetB = createMockReqRes({
      user: userB,
      params: { documentId: docId },
    });
    await getProgress(mockGetB.req, mockGetB.res);
    assert.equal(mockGetB.getStatus(), 200);
    assert.equal(
      mockGetB.getData().progress,
      null,
      'User B must NOT see User A reading progress'
    );

    // User B saves their own progress on the same document at page 4
    const mockSaveB = createMockReqRes({
      user: userB,
      body: { documentId: docId, pageNumber: 4, totalPages: 100 },
    });
    await saveProgress(mockSaveB.req, mockSaveB.res);
    assert.equal(mockSaveB.getStatus(), 200);

    // Verify User A still has page 27
    const checkA = createMockReqRes({
      user: userA,
      params: { documentId: docId },
    });
    await getProgress(checkA.req, checkA.res);
    assert.equal(checkA.getData().progress.pageNumber, 27);

    // Verify User B has page 4
    const checkB = createMockReqRes({
      user: userB,
      params: { documentId: docId },
    });
    await getProgress(checkB.req, checkB.res);
    assert.equal(checkB.getData().progress.pageNumber, 4);

    // Total documents in DB for this documentId must be 2 (one per user)
    const count = await ReadingProgress.countDocuments({ documentId: docId });
    assert.equal(count, 2);
  });

  test('6. Input validation: Rejects invalid page numbers and missing documentId', async () => {
    // Missing documentId
    const missingDoc = createMockReqRes({
      user: userA,
      body: { pageNumber: 5 },
    });
    await saveProgress(missingDoc.req, missingDoc.res);
    assert.equal(missingDoc.getStatus(), 400);

    // Page 0
    const zeroPage = createMockReqRes({
      user: userA,
      body: { documentId: `test-doc-val-${TS}`, pageNumber: 0 },
    });
    await saveProgress(zeroPage.req, zeroPage.res);
    assert.equal(zeroPage.getStatus(), 400);

    // Negative page
    const negPage = createMockReqRes({
      user: userA,
      body: { documentId: `test-doc-val-${TS}`, pageNumber: -3 },
    });
    await saveProgress(negPage.req, negPage.res);
    assert.equal(negPage.getStatus(), 400);

    // Float page
    const floatPage = createMockReqRes({
      user: userA,
      body: { documentId: `test-doc-val-${TS}`, pageNumber: 2.7 },
    });
    await saveProgress(floatPage.req, floatPage.res);
    assert.equal(floatPage.getStatus(), 400);

    // Page > totalPages
    const exceedPage = createMockReqRes({
      user: userA,
      body: { documentId: `test-doc-val-${TS}`, pageNumber: 50, totalPages: 20 },
    });
    await saveProgress(exceedPage.req, exceedPage.res);
    assert.equal(exceedPage.getStatus(), 400);
    assert.match(exceedPage.getData().message, /cannot exceed total pages/i);
  });

  test('7. Unsaved document returns progress: null gracefully', async () => {
    const mock = createMockReqRes({
      user: userA,
      params: { documentId: `non-existent-doc-${TS}` },
    });
    await getProgress(mock.req, mock.res);
    assert.equal(mock.getStatus(), 200);
    assert.equal(mock.getData().progress, null);
  });

  test('8. Delete progress removes record cleanly', async () => {
    const docId = `test-doc-del-${TS}`;
    const mockSave = createMockReqRes({
      user: userA,
      body: { documentId: docId, pageNumber: 8, totalPages: 10 },
    });
    await saveProgress(mockSave.req, mockSave.res);
    assert.equal(mockSave.getStatus(), 200);

    // Delete
    const mockDel = createMockReqRes({
      user: userA,
      params: { documentId: docId },
    });
    await deleteProgress(mockDel.req, mockDel.res);
    assert.equal(mockDel.getStatus(), 200);

    // Verify it is gone
    const mockCheck = createMockReqRes({
      user: userA,
      params: { documentId: docId },
    });
    await getProgress(mockCheck.req, mockCheck.res);
    assert.equal(mockCheck.getData().progress, null);
  });

  test('8b. Get all progress records returns user list', async () => {
    const mockAll = createMockReqRes({ user: userA });
    await getAllProgress(mockAll.req, mockAll.res);
    assert.equal(mockAll.getStatus(), 200);
    assert.ok(Array.isArray(mockAll.getData().progressList));
  });

  describe('HTTP Route-Level Integration & Authentication', () => {
    let server;
    let baseUrl;

    before(async () => {
      const app = (await import('../src/app.js')).default;
      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const address = server.address();
          baseUrl = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('9. POST /api/progress without auth token returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'test-doc', pageNumber: 1 }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized/i);
    });

    test('10. GET /api/progress/:documentId with invalid token returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/progress/test-doc`, {
        headers: { Authorization: 'Bearer bogus-token' },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /not authorized/i);
    });
  });
});
