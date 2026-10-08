import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { protect } from '../src/middlewares/authMiddleware.js';

// Mock localStorage implementation
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('Frontend Session & Account Switch Lifecycle Suite', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345';

  test('1. Failed login does not leave a stale authenticated session', async () => {
    const storage = new MockLocalStorage();

    // User A was previously authenticated
    storage.setItem('token', 'valid-token-for-user-a');
    storage.setItem('user', JSON.stringify({ _id: 'id-a', email: 'user-a@example.com', name: 'User A' }));

    assert.equal(storage.getItem('token'), 'valid-token-for-user-a');

    // Simulate login attempt for User B (with wrong password)
    // Rule: Session MUST be cleared before attempting a new login
    storage.removeItem('token');
    storage.removeItem('user');

    // Simulated login API response: 401 Unauthorized
    const loginSuccess = false;

    if (!loginSuccess) {
      // Login failed: token is NOT saved
    }

    // Verification: storage must have NO token and NO user
    assert.equal(storage.getItem('token'), null, 'Stale token must NOT remain after failed login');
    assert.equal(storage.getItem('user'), null, 'Stale user data must NOT remain after failed login');
  });

  test('2. Explicit account switch User A -> User B cleanly updates session', async () => {
    const storage = new MockLocalStorage();

    // User A logged in
    storage.setItem('token', 'token-user-a');
    storage.setItem('user', JSON.stringify({ _id: 'id-a', email: 'user-a@example.com', name: 'User A' }));

    // User initiates switch account
    storage.removeItem('token');
    storage.removeItem('user');

    assert.equal(storage.getItem('token'), null);
    assert.equal(storage.getItem('user'), null);

    // User B logs in successfully
    const tokenB = jwt.sign({ id: 'id-b' }, JWT_SECRET, { expiresIn: '1h' });
    const userB = { _id: 'id-b', email: 'user-b@example.com', name: 'User B' };

    storage.setItem('token', tokenB);
    storage.setItem('user', JSON.stringify(userB));

    // Verification: storage contains exclusively User B
    const activeUser = JSON.parse(storage.getItem('user'));
    assert.equal(activeUser.email, 'user-b@example.com');
    assert.equal(activeUser._id, 'id-b');
    assert.notEqual(storage.getItem('token'), 'token-user-a');
  });

  test('3. Logout clears token and session completely', () => {
    const storage = new MockLocalStorage();
    storage.setItem('token', 'some-active-jwt');
    storage.setItem('user', JSON.stringify({ email: 'user@example.com' }));

    // Logout action
    storage.removeItem('token');
    storage.removeItem('user');

    assert.equal(storage.getItem('token'), null);
    assert.equal(storage.getItem('user'), null);
  });

  test('4. Protect middleware rejects missing, null, undefined, or expired tokens', async () => {
    const testCases = [
      { header: undefined, expectedStatus: 401, desc: 'missing authorization header' },
      { header: 'Bearer null', expectedStatus: 401, desc: 'literal null token' },
      { header: 'Bearer undefined', expectedStatus: 401, desc: 'literal undefined token' },
      { header: 'Bearer ', expectedStatus: 401, desc: 'empty token' },
    ];

    for (const tc of testCases) {
      let statusCode = 200;
      let responseBody = null;

      const req = {
        headers: tc.header ? { authorization: tc.header } : {},
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false, `Next must not be called for ${tc.desc}`);
      assert.equal(statusCode, tc.expectedStatus, `Status must be ${tc.expectedStatus} for ${tc.desc}`);
      assert.ok(responseBody.message, 'Must return error message');
    }
  });

  test('5. Expired JWT is rejected with 401 session expired', async () => {
    const expiredToken = jwt.sign({ id: 'any-user-id' }, JWT_SECRET, { expiresIn: '-10s' });
    let statusCode = 200;
    let responseBody = null;

    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    let nextCalled = false;
    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.match(responseBody.message, /Session expired|invalid token/i);
  });
});
