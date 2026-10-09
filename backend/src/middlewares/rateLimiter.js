/**
 * Lightweight in-memory rate limiting middleware for production protection.
 * Requires zero external dependencies.
 */

export function createRateLimiter({ windowMs = 60 * 1000, max = 60, message = 'Too many requests, please try again later.' } = {}) {
  const store = new Map(); // ip -> { count, resetTime }

  // Periodic cleanup of stale entries every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(ip);
      }
    }
  }, 2 * 60 * 1000);

  // Unref interval to avoid keeping process alive in test runners
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    // Determine client identifier
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(clientIp);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(clientIp, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        message,
        retryAfter: retryAfterSeconds,
      });
    }

    next();
  };
}

/**
 * Authentication Rate Limiter
 *
 * Target: 10 attempts per 15-minute window per IP in production.
 * Test isolation: 2000 attempts per 15-minute window in 'test' mode to prevent flaky suites.
 *
 * Architecture & Security Notes:
 * 1. In-memory limitations:
 *    - This limiter maintains state in a Node.js process-local Map.
 *    - Server restarts or deployments reset counters immediately.
 *    - In multi-instance or auto-scaling clusters (e.g. multi-dyno/multi-container),
 *      requests routed to different instances have separate counters.
 *    - For distributed scaling, migrate to a shared Redis store (e.g. rate-limit-redis).
 * 2. IP-based throttling vs. Account Lockout:
 *    - We intentionally throttle by client IP rather than locking out the user account.
 *    - Global account lockouts keyed solely on target email enable Denial-of-Service (DoS)
 *      attacks where an adversary deliberately triggers lockouts on arbitrary users.
 * 3. Controlled response:
 *    - Returns HTTP 429 with generic message and Retry-After header.
 *    - Never reveals whether an email account exists in the system.
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 2000 : 10,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

export const wordLookupLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many word lookup requests. Please slow down.',
});
