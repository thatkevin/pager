/**
 * Pager auth worker — CORS proxy for GitHub OAuth device flow.
 *
 * Required env var: GITHUB_CLIENT_ID
 * Set via: wrangler secret put GITHUB_CLIENT_ID  (or wrangler.toml [vars] for non-secret)
 *
 * Routes:
 *   POST /device/code  → https://github.com/login/device/code
 *   POST /token        → https://github.com/login/oauth/access_token
 */

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL       = 'https://github.com/login/oauth/access_token';

const ALLOWED_ORIGINS = new Set([
  'https://pager.kev.cc',
  'http://localhost:8080',  // local dev
  'http://127.0.0.1:8080',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!env.GITHUB_CLIENT_ID) {
      return jsonResponse({ error: 'Worker not configured: missing GITHUB_CLIENT_ID' }, 500, origin);
    }

    const url = new URL(request.url);
    let targetUrl;

    if (url.pathname === '/device/code') {
      targetUrl = GITHUB_DEVICE_CODE_URL;
    } else if (url.pathname === '/token') {
      targetUrl = GITHUB_TOKEN_URL;
    } else {
      return new Response('Not found', { status: 404 });
    }

    // Read body and inject client_id — never let the client supply it
    let body;
    try {
      body = await request.text();
    } catch {
      return jsonResponse({ error: 'Bad request' }, 400, origin);
    }

    const params = new URLSearchParams(body);
    params.delete('client_id');     // prevent client overriding it
    params.delete('client_secret'); // never allow secret forwarding
    params.set('client_id', env.GITHUB_CLIENT_ID);

    let ghRes;
    try {
      ghRes = await fetch(targetUrl, {
        method:  'POST',
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':   'pager-auth-worker/1.0',
        },
        body: params.toString(),
      });
    } catch (e) {
      return jsonResponse({ error: 'GitHub unreachable' }, 502, origin);
    }

    const data = await ghRes.json();
    return jsonResponse(data, ghRes.status, origin);
  },
};
