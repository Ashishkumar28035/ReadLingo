/**
 * Email Service for ReadLingo
 *
 * Implements password reset email delivery with support for:
 * 1. Resend API (via HTTPS fetch - zero extra dependencies)
 * 2. Extensible provider foundation
 *
 * Safety & Security Rules:
 * - Never log or expose raw reset tokens in production logs.
 * - Never leak credentials or fail silently if credentials are invalid.
 * - If no provider is configured, handle gracefully without exposing tokens in public logs or API responses.
 */

/**
 * Safely escapes HTML special characters to prevent HTML injection in emails.
 * Handles &, <, >, ", and '.
 */
export function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

export async function sendPasswordResetEmail({ to, name, resetUrl, resetToken }) {
  const isProduction = process.env.NODE_ENV === 'production';
  const fromAddress = process.env.EMAIL_FROM || 'ReadLingo <no-reply@readlingo.app>';
  const safeName = escapeHtml(name) || 'there';

  // 1. Resend HTTP API support (zero dependencies, works out of the box with Node 18+ fetch)
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject: 'Reset your ReadLingo password',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
              <h2 style="color: #4f46e5; margin-bottom: 16px;">ReadLingo Password Reset</h2>
              <p>Hello ${safeName},</p>
              <p>We received a request to reset your password for your ReadLingo account.</p>
              <p style="margin: 28px 0;">
                <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                  Reset My Password
                </a>
              </p>
              <p style="font-size: 14px; color: #64748b;">This link is valid for 15 minutes and can only be used once.</p>
              <p style="font-size: 14px; color: #64748b;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #94a3b8;">If the button above doesn't work, copy and paste this URL into your browser:<br/><span style="color: #64748b; word-break: break-all;">${resetUrl}</span></p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ReadLingo Email] Resend API error:', errorData);
        throw new Error('Failed to deliver email through provider');
      }

      return { sent: true, provider: 'resend' };
    } catch (err) {
      console.error('[ReadLingo Email] Error delivering email:', err.message);
      throw err;
    }
  }

  // 2. Fallback when no email provider is configured
  // In development/test mode, log safe notice so developers know why no email went out
  if (!isProduction) {
    if (process.env.NODE_ENV === 'test') {
      // Return clean sent status for test runner without noisy logs
      return { sent: true, provider: 'test-mock', resetToken };
    }
    console.info(`[ReadLingo Email] No email provider configured (RESEND_API_KEY). Reset requested for ${to}.`);
  } else {
    // In production, emit safe warning without leaking tokens, passwords, reset URLs, or user PII
    console.warn('[ReadLingo Email] RESEND_API_KEY is not configured in production. Password reset email skipped.');
  }

  return { sent: false, provider: 'none', reason: 'PROVIDER_NOT_CONFIGURED' };
}
