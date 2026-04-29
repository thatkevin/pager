/**
 * Pager headers worker — security header injection for pager.kev.cc.
 *
 * Bound to pager.kev.cc/* via wrangler.toml.
 * Passes all requests through to GitHub Pages origin, then attaches
 * security headers (CSP, HSTS, etc.) to every response.
 *
 * Deploy: wrangler deploy (from the worker-headers/ directory)
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https://raw.githubusercontent.com https://avatars.githubusercontent.com",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://avatars.githubusercontent.com https://pager-auth.kevs.workers.dev",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy':   CSP,
  'X-Content-Type-Options':    'nosniff',
  'X-Frame-Options':           'DENY',
  'Referrer-Policy':           'strict-origin-when-cross-origin',
  'Permissions-Policy':        'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

// Headers from origin we don't want to pass through.
const STRIP_HEADERS = new Set([
  'x-powered-by',
  'server',
  'x-runtime',
  'x-request-id',
]);

export default {
  async fetch(request) {
    const response = await fetch(request);

    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }

    for (const name of STRIP_HEADERS) {
      headers.delete(name);
    }

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
