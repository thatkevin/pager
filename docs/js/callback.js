import { CONFIG } from './config.js';

const statusEl = document.getElementById('status');
const params   = new URLSearchParams(location.search);
const code     = params.get('code');
const state    = params.get('state');
const saved    = sessionStorage.getItem('pager_oauth_state');

function showError(msg) {
  statusEl.innerHTML = '';
  const el = document.createElement('div');
  el.className    = 'error';
  el.textContent  = msg;
  statusEl.appendChild(el);
}

if (!code) {
  showError('No authorisation code returned from GitHub.');
} else if (!saved || state !== saved) {
  showError('Invalid state — possible CSRF. Try logging in again.');
} else {
  sessionStorage.removeItem('pager_oauth_state');
  try {
    const res  = await fetch(`${CONFIG.workerUrl}/exchange`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ code }).toString(),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('cms_gh_token', data.token);
      location.replace('./');
    } else {
      showError(data.error || 'Login failed. Try again.');
    }
  } catch (e) {
    showError('Could not reach the auth worker. ' + e.message);
  }
}
