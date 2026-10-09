export const MIN_JWT_SECRET_LENGTH = 32;

export const INSECURE_JWT_SECRETS = new Set([
  'your_jwt_secret_key',
  'secret',
  'jwt_secret',
  'readlingo_secret',
  'readlingo_super_secret_jwt_key_2026',
  '12345678901234567890123456789012',
  'change_me',
  'default_secret',
]);

/**
 * Validates the JWT_SECRET environment variable for strength and security.
 * Throws an Error with a safe message (never exposing the secret) if invalid.
 *
 * @param {string} secret - The secret string to validate
 * @param {string} [nodeEnv] - Current NODE_ENV ('production' | 'development' | 'test')
 * @returns {boolean} True if validation succeeds
 */
export function validateJwtSecret(secret, nodeEnv = process.env.NODE_ENV) {
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error('JWT_SECRET environment variable is missing or empty. Server startup aborted.');
  }

  const isProduction = nodeEnv === 'production';
  const trimmed = secret.trim();

  if (isProduction && INSECURE_JWT_SECRETS.has(trimmed.toLowerCase())) {
    throw new Error(
      'JWT_SECRET uses a known default or placeholder value. In production, set a cryptographically random secret (e.g. openssl rand -hex 32).'
    );
  }

  if (trimmed.length < MIN_JWT_SECRET_LENGTH) {
    if (isProduction) {
      throw new Error(
        `JWT_SECRET is insufficiently strong for production (length ${trimmed.length} < ${MIN_JWT_SECRET_LENGTH}). Use at least 32 characters / 256 bits.`
      );
    } else {
      console.warn(
        `[ReadLingo] Warning: JWT_SECRET has length ${trimmed.length}, which is less than the recommended minimum of ${MIN_JWT_SECRET_LENGTH} characters.`
      );
    }
  }

  return true;
}
