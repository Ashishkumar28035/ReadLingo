import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-security';
}

import User from '../src/models/User.js';
import { signup, login, forgotPassword, resetPassword } from '../src/controllers/authController.js';
import { protect } from '../src/middlewares/authMiddleware.js';
import { escapeHtml, sendPasswordResetEmail } from '../src/utils/emailService.js';

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

describe('Password Reset Security & Lifecycle Suite', () => {
  const TS = Date.now();
  const TEST_USER_EMAIL = `reset-user-${TS}@example.com`;
  const INITIAL_PASSWORD = 'Initial-Secure-Password-123!';
  const NEW_PASSWORD = 'Brand-New-Secure-Password-456!';

  let userId = null;
  let initialJwt = null;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/readlingo';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: 'readlingo', family: 4 });
    }

    // Create initial user
    const mockSignup = createMockReqRes({
      body: { name: 'Reset Test User', email: TEST_USER_EMAIL, password: INITIAL_PASSWORD },
    });
    await signup(mockSignup.req, mockSignup.res);
    assert.equal(mockSignup.getStatus(), 201);
    userId = mockSignup.getData()._id.toString();
    initialJwt = mockSignup.getData().token;
    assert.ok(initialJwt, 'Initial JWT must be generated on signup');
  });

  after(async () => {
    await User.deleteMany({
      email: { $regex: /^reset-user-/ },
    });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('1. forgotPassword: Anti-enumeration: returns generic 200 for registered and unregistered emails', async () => {
    // Registered email
    const mockRegistered = createMockReqRes({
      body: { email: TEST_USER_EMAIL },
    });
    await forgotPassword(mockRegistered.req, mockRegistered.res);
    assert.equal(mockRegistered.getStatus(), 200);
    assert.match(mockRegistered.getData().message, /If an account exists/i);
    // CRITICAL: Token must NEVER be exposed in response body
    assert.equal(mockRegistered.getData().token, undefined);
    assert.equal(mockRegistered.getData().resetToken, undefined);

    // Unregistered email
    const mockUnregistered = createMockReqRes({
      body: { email: `nonexistent-${TS}@example.com` },
    });
    await forgotPassword(mockUnregistered.req, mockUnregistered.res);
    assert.equal(mockUnregistered.getStatus(), 200);
    assert.match(mockUnregistered.getData().message, /If an account exists/i);
    assert.equal(mockUnregistered.getData().token, undefined);
  });

  test('2. forgotPassword: input validation rejects invalid formats and types', async () => {
    // Missing email
    const mockEmpty = createMockReqRes({ body: {} });
    await forgotPassword(mockEmpty.req, mockEmpty.res);
    assert.equal(mockEmpty.getStatus(), 400);

    // Malformed email
    const mockMalformed = createMockReqRes({ body: { email: 'not-an-email' } });
    await forgotPassword(mockMalformed.req, mockMalformed.res);
    assert.equal(mockMalformed.getStatus(), 400);

    // Non-string type
    const mockBadType = createMockReqRes({ body: { email: 12345 } });
    await forgotPassword(mockBadType.req, mockBadType.res);
    assert.equal(mockBadType.getStatus(), 400);
  });

  test('3. forgotPassword: token is securely generated, hashed with SHA-256, and stored with 15m expiration', async () => {
    // Check DB record for user
    const user = await User.findById(userId).select('+resetPasswordToken +resetPasswordExpire');
    assert.ok(user.resetPasswordToken, 'Hashed token must exist in DB');
    assert.ok(user.resetPasswordExpire, 'Token expire date must exist in DB');
    // Ensure it is a 64-character SHA-256 hex string
    assert.equal(user.resetPasswordToken.length, 64);
    // Ensure expiration is in the future (~15 mins)
    const timeUntilExpire = user.resetPasswordExpire.getTime() - Date.now();
    assert.ok(timeUntilExpire > 14 * 60 * 1000 && timeUntilExpire <= 15 * 60 * 1000);
  });

  test('4. resetPassword: input validation rejects missing/invalid passwords and tokens', async () => {
    // Missing token
    const mockNoToken = createMockReqRes({
      body: { password: 'ValidPassword123' },
    });
    await resetPassword(mockNoToken.req, mockNoToken.res);
    assert.equal(mockNoToken.getStatus(), 400);
    assert.match(mockNoToken.getData().message, /token/i);

    // Short password (< 6 chars)
    const mockShortPass = createMockReqRes({
      body: { token: 'sometoken', password: '123' },
    });
    await resetPassword(mockShortPass.req, mockShortPass.res);
    assert.equal(mockShortPass.getStatus(), 400);
    assert.match(mockShortPass.getData().message, /6 characters/i);

    // Excessively long password (> 128 chars)
    const mockLongPass = createMockReqRes({
      body: { token: 'sometoken', password: 'A'.repeat(129) },
    });
    await resetPassword(mockLongPass.req, mockLongPass.res);
    assert.equal(mockLongPass.getStatus(), 400);
    assert.match(mockLongPass.getData().message, /128 characters/i);
  });

  test('5. resetPassword: rejects invalid/unknown tokens', async () => {
    const mockInvalid = createMockReqRes({
      body: { token: 'completely-invalid-raw-token-1234567890', password: NEW_PASSWORD },
    });
    await resetPassword(mockInvalid.req, mockInvalid.res);
    assert.equal(mockInvalid.getStatus(), 400);
    assert.match(mockInvalid.getData().message, /Invalid or expired/i);
  });

  test('6. resetPassword: rejects expired tokens', async () => {
    const user = await User.findById(userId);
    const rawToken = user.createPasswordResetToken();
    // Intentionally expire token 5 minutes ago
    user.resetPasswordExpire = new Date(Date.now() - 5 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const mockExpired = createMockReqRes({
      body: { token: rawToken, password: NEW_PASSWORD },
    });
    await resetPassword(mockExpired.req, mockExpired.res);
    assert.equal(mockExpired.getStatus(), 400);
    assert.match(mockExpired.getData().message, /Invalid or expired/i);
  });

  test('7. resetPassword: valid token successfully updates password and invalidates token', async () => {
    const user = await User.findById(userId);
    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const mockReset = createMockReqRes({
      body: { token: rawToken, password: NEW_PASSWORD },
    });
    await resetPassword(mockReset.req, mockReset.res);
    assert.equal(mockReset.getStatus(), 200);
    assert.match(mockReset.getData().message, /successful/i);

    // Verify token is cleared in DB
    const refreshedUser = await User.findById(userId).select('+password +resetPasswordToken +resetPasswordExpire');
    assert.equal(refreshedUser.resetPasswordToken, undefined);
    assert.equal(refreshedUser.resetPasswordExpire, undefined);

    // Verify new password works and old password fails
    const oldLoginMock = createMockReqRes({
      body: { email: TEST_USER_EMAIL, password: INITIAL_PASSWORD },
    });
    await login(oldLoginMock.req, oldLoginMock.res);
    assert.equal(oldLoginMock.getStatus(), 401);

    const newLoginMock = createMockReqRes({
      body: { email: TEST_USER_EMAIL, password: NEW_PASSWORD },
    });
    await login(newLoginMock.req, newLoginMock.res);
    assert.equal(newLoginMock.getStatus(), 200);
    assert.ok(newLoginMock.getData().token, 'Login with new password must return a fresh JWT');
  });

  test('8. resetPassword: token cannot be reused after successful use', async () => {
    // Generate a fresh token
    const user = await User.findById(userId);
    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // First use: must succeed
    const firstUseMock = createMockReqRes({
      body: { token: rawToken, password: 'SecondNewPassword123!' },
    });
    await resetPassword(firstUseMock.req, firstUseMock.res);
    assert.equal(firstUseMock.getStatus(), 200);

    // Second use: must fail (prevent replay attacks)
    const secondUseMock = createMockReqRes({
      body: { token: rawToken, password: 'ThirdNewPassword123!' },
    });
    await resetPassword(secondUseMock.req, secondUseMock.res);
    assert.equal(secondUseMock.getStatus(), 400);
    assert.match(secondUseMock.getData().message, /Invalid or expired/i);
  });

  test('9. Session Security: existing JWT sessions are invalidated after password reset', async () => {
    // Generate an older JWT with iat in the past
    const pastIat = Math.floor(Date.now() / 1000) - 30; // 30 seconds ago
    const olderToken = jwt.sign(
      { id: userId, iat: pastIat },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    let nextCalled = false;
    const mockProtect = createMockReqRes({
      headers: { authorization: `Bearer ${olderToken}` },
    });

    await protect(mockProtect.req, mockProtect.res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'Next middleware should not be called with an invalidated session');
    assert.equal(mockProtect.getStatus(), 401);
    assert.match(mockProtect.getData().message, /Session expired due to password change/i);
  });

  test('10. Email Security: escapeHtml neutralizes &, <, >, ", and single quotes', () => {
    assert.equal(escapeHtml('John & Jane'), 'John &amp; Jane');
    assert.equal(escapeHtml('<script>alert("XSS")</script>'), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml("O'Connor"), 'O&#39;Connor');
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('11. Email Security: sendPasswordResetEmail sanitizes malicious user name in outbound email HTML', async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.RESEND_API_KEY;

    try {
      process.env.RESEND_API_KEY = 're_mock_test_key_for_sanitization_test';
      let capturedBody = null;

      globalThis.fetch = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({ id: 'mock_email_id_123' }),
        };
      };

      const maliciousName = '<img src=x onerror=alert(1)> & "Admin" \'Super\'';
      const result = await sendPasswordResetEmail({
        to: 'test-sanitize@example.com',
        name: maliciousName,
        resetUrl: 'http://localhost:5173/reset-password?token=sample-test-token',
        resetToken: 'sample-test-token',
      });

      assert.equal(result.sent, true);
      assert.equal(result.provider, 'resend');
      assert.ok(capturedBody && capturedBody.html);

      // Verify raw HTML tag syntax is NOT rendered in the email template
      assert.doesNotMatch(capturedBody.html, /<img\b/i);

      // Verify characters are properly HTML-escaped
      assert.match(capturedBody.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
      assert.match(capturedBody.html, /&amp;/);
      assert.match(capturedBody.html, /&quot;Admin&quot;/);
      assert.match(capturedBody.html, /&#39;Super&#39;/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey !== undefined) {
        process.env.RESEND_API_KEY = originalApiKey;
      } else {
        delete process.env.RESEND_API_KEY;
      }
    }
  });

  test('12. JWT Algorithm Pinning: protect middleware accepts HS256 and rejects disallowed algorithms', async () => {
    // 12a. Valid HS256 token must succeed
    const validHs256Token = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    let hs256NextCalled = false;
    const mockHs256 = createMockReqRes({
      headers: { authorization: `Bearer ${validHs256Token}` },
    });
    await protect(mockHs256.req, mockHs256.res, () => {
      hs256NextCalled = true;
    });
    assert.equal(hs256NextCalled, true, 'HS256 signed token must be accepted');

    // 12b. Forged token with unsupported algorithm header (e.g. HS384/HS512 or none) must be rejected
    // Simulate by constructing a token signed with a mismatched algorithm option
    const disallowedAlgoToken = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { algorithm: 'HS384', expiresIn: '1h' }
    );

    let badAlgoNextCalled = false;
    const mockBadAlgo = createMockReqRes({
      headers: { authorization: `Bearer ${disallowedAlgoToken}` },
    });
    await protect(mockBadAlgo.req, mockBadAlgo.res, () => {
      badAlgoNextCalled = true;
    });
    assert.equal(badAlgoNextCalled, false, 'Disallowed algorithm token must be rejected');
    assert.equal(mockBadAlgo.getStatus(), 401);
    assert.match(mockBadAlgo.getData().message, /invalid token/i);
  });

  test('13. Email Provider Diagnostics: production mode without RESEND_API_KEY logs safe warning without leaking secrets', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.RESEND_API_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.RESEND_API_KEY;

      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (msg) => {
        warnings.push(String(msg));
      };

      const result = await sendPasswordResetEmail({
        to: 'production-user@example.com',
        name: 'Production User',
        resetUrl: 'http://localhost:5173/reset-password?token=secret-token-123',
        resetToken: 'secret-token-123',
      });

      console.warn = originalWarn;

      assert.equal(result.sent, false);
      assert.equal(result.provider, 'none');
      assert.equal(result.reason, 'PROVIDER_NOT_CONFIGURED');

      // Verify a safe diagnostic warning was emitted
      assert.equal(warnings.length >= 1, true);
      const combinedWarnings = warnings.join(' ');
      assert.match(combinedWarnings, /RESEND_API_KEY is not configured in production/i);
      // Ensure zero secrets, tokens, passwords, or reset URLs are leaked
      assert.doesNotMatch(combinedWarnings, /secret-token-123/);
      assert.doesNotMatch(combinedWarnings, /resetUrl/);
      assert.doesNotMatch(combinedWarnings, /production-user@example\.com/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalApiKey) {
        process.env.RESEND_API_KEY = originalApiKey;
      }
    }
  });
});
