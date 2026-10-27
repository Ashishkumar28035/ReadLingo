import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

describe('CORS and Preflight Verification Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
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

  describe('Preflight OPTIONS Handling', () => {
    test('OPTIONS /api/auth/login allows https://readlingo-app.vercel.app with credentials', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://readlingo-app.vercel.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://readlingo-app.vercel.app');
      assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
      assert.notStrictEqual(res.headers.get('access-control-allow-origin'), '*');
      assert.ok(res.headers.get('access-control-allow-methods')?.includes('POST'));
    });

    test('OPTIONS /api/auth/login allows previous production origin https://readlingo-three.vercel.app', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://readlingo-three.vercel.app',
          'Access-Control-Request-Method': 'POST',
        },
      });

      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://readlingo-three.vercel.app');
      assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    });

    test('OPTIONS /api/auth/login handles trailing slash in request origin gracefully', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://readlingo-app.vercel.app/',
          'Access-Control-Request-Method': 'POST',
        },
      });

      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://readlingo-app.vercel.app/');
    });
  });

  describe('Actual Request CORS Headers', () => {
    test('GET /api/health from https://readlingo-app.vercel.app includes CORS headers', async () => {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: 'https://readlingo-app.vercel.app',
        },
      });

      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://readlingo-app.vercel.app');
      assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
      assert.notStrictEqual(res.headers.get('access-control-allow-origin'), '*');
    });

    test('GET /api/health without origin header succeeds (server-to-server / health check)', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.ok([200, 503].includes(res.status));
    });
  });
});
