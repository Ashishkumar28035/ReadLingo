import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

import User from '../src/models/User.js';
import { signup, login, getMe } from '../src/controllers/authController.js';
import { protect } from '../src/middlewares/authMiddleware.js';

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

describe('Authentication Security & Isolation Suite', () => {
  const TS = Date.now();
  const USER_A_EMAIL = `auth-test-a-${TS}@example.com`;
  const USER_A_PASS = 'A-Strong-Pass-123!';
  const USER_B_EMAIL = `auth-test-b-${TS}@example.com`;
  const USER_B_PASS = 'B-Strong-Pass-456!';

  let userAId = null;
  let userBId = null;
  let tokenA = null;
  let tokenB = null;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/readlingo';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: 'readlingo', family: 4 });
    }
  });

  after(async () => {
    await User.deleteMany({
      email: { $regex: /^auth-test-/ },
    });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('PHASE 2: Separate documents created and passwords securely hashed', async () => {
    // Signup User A
    const mockA = createMockReqRes({
      body: { name: 'User A', email: USER_A_EMAIL, password: USER_A_PASS },
    });
    await signup(mockA.req, mockA.res);
    assert.equal(mockA.getStatus(), 201);
    userAId = mockA.getData()._id.toString();
    tokenA = mockA.getData().token;
    assert.ok(tokenA, 'User A token must exist');

    // Signup User B
    const mockB = createMockReqRes({
      body: { name: 'User B', email: USER_B_EMAIL, password: USER_B_PASS },
    });
    await signup(mockB.req, mockB.res);
    assert.equal(mockB.getStatus(), 201);
    userBId = mockB.getData()._id.toString();
    tokenB = mockB.getData().token;
    assert.ok(tokenB, 'User B token must exist');

    // Verify documents in MongoDB
    assert.notEqual(userAId, userBId, 'Users A and B must have distinct _id values');

    const docA = await User.findOne({ email: USER_A_EMAIL }).select('+password');
    const docB = await User.findOne({ email: USER_B_EMAIL }).select('+password');

    assert.ok(docA, 'User A document must exist');
    assert.ok(docB, 'User B document must exist');

    // Hashing verification
    assert.notEqual(docA.password, USER_A_PASS, 'Plaintext password must NOT be stored');
    assert.notEqual(docB.password, USER_B_PASS, 'Plaintext password must NOT be stored');
    assert.match(docA.password, /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/, 'Must be valid bcrypt hash');
    assert.match(docB.password, /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/, 'Must be valid bcrypt hash');
    assert.notEqual(docA.password, docB.password, 'User password hashes must not be identical');

    // select: false verification
    const docWithoutSelect = await User.findOne({ email: USER_A_EMAIL });
    assert.equal(docWithoutSelect.password, undefined, 'select: false must exclude password by default');
  });

  test('PHASE 3: Cross-password attack matrix', async () => {
    // 1. User A with User A password -> MUST PASS (200)
    const mockA_A = createMockReqRes({ body: { email: USER_A_EMAIL, password: USER_A_PASS } });
    await login(mockA_A.req, mockA_A.res);
    assert.equal(mockA_A.getStatus(), 200);
    assert.equal(mockA_A.getData().email, USER_A_EMAIL);

    // 2. User B with User B password -> MUST PASS (200)
    const mockB_B = createMockReqRes({ body: { email: USER_B_EMAIL, password: USER_B_PASS } });
    await login(mockB_B.req, mockB_B.res);
    assert.equal(mockB_B.getStatus(), 200);
    assert.equal(mockB_B.getData().email, USER_B_EMAIL);

    // 3. User A email with User B password -> MUST FAIL (401)
    const mockA_B = createMockReqRes({ body: { email: USER_A_EMAIL, password: USER_B_PASS } });
    await login(mockA_B.req, mockA_B.res);
    assert.equal(mockA_B.getStatus(), 401);
    assert.equal(mockA_B.getData().message, 'Invalid email or password');

    // 4. User B email with User A password -> MUST FAIL (401)
    const mockB_A = createMockReqRes({ body: { email: USER_B_EMAIL, password: USER_A_PASS } });
    await login(mockB_A.req, mockB_A.res);
    assert.equal(mockB_A.getStatus(), 401);
    assert.equal(mockB_A.getData().message, 'Invalid email or password');

    // 5. Wrong random password -> MUST FAIL (401)
    const mockWrongA = createMockReqRes({ body: { email: USER_A_EMAIL, password: 'Random-Wrong-Password-999!' } });
    await login(mockWrongA.req, mockWrongA.res);
    assert.equal(mockWrongA.getStatus(), 401);

    const mockWrongB = createMockReqRes({ body: { email: USER_B_EMAIL, password: 'Random-Wrong-Password-999!' } });
    await login(mockWrongB.req, mockWrongB.res);
    assert.equal(mockWrongB.getStatus(), 401);

    // 6. Empty password -> MUST FAIL (400)
    const mockEmptyA = createMockReqRes({ body: { email: USER_A_EMAIL, password: '' } });
    await login(mockEmptyA.req, mockEmptyA.res);
    assert.equal(mockEmptyA.getStatus(), 400);

    // 7. Case-modified password -> MUST FAIL (401)
    const mockCaseA = createMockReqRes({ body: { email: USER_A_EMAIL, password: USER_A_PASS.toLowerCase() } });
    await login(mockCaseA.req, mockCaseA.res);
    assert.equal(mockCaseA.getStatus(), 401);
  });

  test('PHASE 4 & 5: JWT user identity and isolation', async () => {
    // Generate fresh tokens via login
    const mockLoginA = createMockReqRes({ body: { email: USER_A_EMAIL, password: USER_A_PASS } });
    await login(mockLoginA.req, mockLoginA.res);
    const loginTokenA = mockLoginA.getData().token;

    const mockLoginB = createMockReqRes({ body: { email: USER_B_EMAIL, password: USER_B_PASS } });
    await login(mockLoginB.req, mockLoginB.res);
    const loginTokenB = mockLoginB.getData().token;

    assert.notEqual(loginTokenA, loginTokenB);

    // Verify User A token via protect + getMe
    const mockMeA = createMockReqRes({ headers: { authorization: `Bearer ${loginTokenA}` } });
    let protectCalledNextA = false;
    await protect(mockMeA.req, mockMeA.res, () => {
      protectCalledNextA = true;
    });
    assert.ok(protectCalledNextA, 'Protect middleware must accept valid token A');
    assert.equal(mockMeA.req.user._id.toString(), userAId, 'Decoded user must match User A');

    await getMe(mockMeA.req, mockMeA.res);
    assert.equal(mockMeA.getStatus(), 200);
    assert.equal(mockMeA.getData().email, USER_A_EMAIL);
    assert.equal(mockMeA.getData()._id.toString(), userAId);

    // Verify User B token via protect + getMe
    const mockMeB = createMockReqRes({ headers: { authorization: `Bearer ${loginTokenB}` } });
    let protectCalledNextB = false;
    await protect(mockMeB.req, mockMeB.res, () => {
      protectCalledNextB = true;
    });
    assert.ok(protectCalledNextB, 'Protect middleware must accept valid token B');
    assert.equal(mockMeB.req.user._id.toString(), userBId, 'Decoded user must match User B');

    await getMe(mockMeB.req, mockMeB.res);
    assert.equal(mockMeB.getStatus(), 200);
    assert.equal(mockMeB.getData().email, USER_B_EMAIL);
    assert.equal(mockMeB.getData()._id.toString(), userBId);
  });

  test('PHASE 7: Password edge cases (whitespace not silently altered)', async () => {
    const P_RAW = '  Padded-Password-123!  ';
    const EMAIL_P = `auth-test-pad-${TS}@example.com`;

    const mockSignupP = createMockReqRes({
      body: { name: 'User P', email: EMAIL_P, password: P_RAW },
    });
    await signup(mockSignupP.req, mockSignupP.res);
    assert.equal(mockSignupP.getStatus(), 201);

    // Login with exact padded password -> MUST PASS
    const mockLoginExact = createMockReqRes({ body: { email: EMAIL_P, password: P_RAW } });
    await login(mockLoginExact.req, mockLoginExact.res);
    assert.equal(mockLoginExact.getStatus(), 200);

    // Login with trimmed password -> MUST FAIL (401), passwords must NOT be silently trimmed
    const mockLoginTrimmed = createMockReqRes({ body: { email: EMAIL_P, password: P_RAW.trim() } });
    await login(mockLoginTrimmed.req, mockLoginTrimmed.res);
    assert.equal(mockLoginTrimmed.getStatus(), 401);
  });

  test('PHASE 8: Concurrency & Race Condition Test (20 simultaneous logins)', async () => {
    const concurrentRequests = [];

    for (let i = 0; i < 20; i++) {
      const isA = i % 2 === 0;
      const targetEmail = isA ? USER_A_EMAIL : USER_B_EMAIL;
      const targetPass = isA ? USER_A_PASS : USER_B_PASS;
      const targetId = isA ? userAId : userBId;

      concurrentRequests.push(
        (async () => {
          const mock = createMockReqRes({ body: { email: targetEmail, password: targetPass } });
          await login(mock.req, mock.res);
          return {
            status: mock.getStatus(),
            actualEmail: mock.getData()?.email,
            actualId: mock.getData()?._id?.toString(),
            expectedEmail: targetEmail,
            expectedId: targetId,
          };
        })()
      );
    }

    const results = await Promise.all(concurrentRequests);

    for (const r of results) {
      assert.equal(r.status, 200, 'Every valid concurrent login must succeed');
      assert.equal(r.actualEmail, r.expectedEmail, 'Actual email must match expected email with zero cross-talk');
      assert.equal(r.actualId, r.expectedId, 'Actual ID must match expected ID with zero cross-talk');
    }
  });

  test('PHASE 10: NoSQL injection & malformed input attacks', async () => {
    // 1. Email object { $ne: null }
    const mockNosqlEmail = createMockReqRes({ body: { email: { $ne: null }, password: USER_A_PASS } });
    await login(mockNosqlEmail.req, mockNosqlEmail.res);
    assert.equal(mockNosqlEmail.getStatus(), 400);

    // 2. Password object { $ne: null }
    const mockNosqlPass = createMockReqRes({ body: { email: USER_A_EMAIL, password: { $ne: null } } });
    await login(mockNosqlPass.req, mockNosqlPass.res);
    assert.equal(mockNosqlPass.getStatus(), 400);

    // 3. Array email
    const mockArrayEmail = createMockReqRes({ body: { email: [USER_A_EMAIL], password: USER_A_PASS } });
    await login(mockArrayEmail.req, mockArrayEmail.res);
    assert.equal(mockArrayEmail.getStatus(), 400);

    // 4. Null email & password
    const mockNull = createMockReqRes({ body: { email: null, password: null } });
    await login(mockNull.req, mockNull.res);
    assert.equal(mockNull.getStatus(), 400);

    // 5. Missing body fields
    const mockEmpty = createMockReqRes({ body: {} });
    await login(mockEmpty.req, mockEmpty.res);
    assert.equal(mockEmpty.getStatus(), 400);
  });

  test('PHASE 11: Identical password yields distinct bcrypt salts', async () => {
    const COMMON_PASS = 'Identical-Password-789!';
    const EMAIL_S1 = `auth-test-s1-${TS}@example.com`;
    const EMAIL_S2 = `auth-test-s2-${TS}@example.com`;

    const mockS1 = createMockReqRes({ body: { name: 'User S1', email: EMAIL_S1, password: COMMON_PASS } });
    await signup(mockS1.req, mockS1.res);
    assert.equal(mockS1.getStatus(), 201);

    const mockS2 = createMockReqRes({ body: { name: 'User S2', email: EMAIL_S2, password: COMMON_PASS } });
    await signup(mockS2.req, mockS2.res);
    assert.equal(mockS2.getStatus(), 201);

    const docS1 = await User.findOne({ email: EMAIL_S1 }).select('+password');
    const docS2 = await User.findOne({ email: EMAIL_S2 }).select('+password');

    assert.notEqual(docS1.password, docS2.password, 'Bcrypt salts must be unique for each user even with identical passwords');

    const s1Valid = await bcrypt.compare(COMMON_PASS, docS1.password);
    const s2Valid = await bcrypt.compare(COMMON_PASS, docS2.password);
    assert.ok(s1Valid, 'Password S1 must match hash');
    assert.ok(s2Valid, 'Password S2 must match hash');
  });
});
