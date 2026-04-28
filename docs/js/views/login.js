
const GUIDE_HTML = `
  <div class="pat-guide">
    <div class="pat-guide-header">
      <h2>Getting a GitHub token</h2>
      <button class="btn btn-ghost btn-sm" id="guide-close">✕</button>
    </div>
    <ol class="pat-steps">
      <li>
        <strong>Go to GitHub Settings</strong>
        <p>Click your avatar → <em>Settings</em> → <em>Developer settings</em> → <em>Personal access tokens</em> → <em>Tokens (classic)</em>.</p>
        <a class="pat-link" href="https://github.com/settings/tokens/new?scopes=repo&description=pager-cms" target="_blank" rel="noopener">Open GitHub → New token (repo scope pre-selected) ↗</a>
      </li>
      <li>
        <strong>Name it</strong>
        <p>Call it something like <code>pager-cms</code> so you remember what it's for.</p>
      </li>
      <li>
        <strong>Set expiry</strong>
        <p>90 days is sensible. You can always regenerate it here when it expires.</p>
      </li>
      <li>
        <strong>Tick the <code>repo</code> scope</strong>
        <p>This is the only permission needed. It lets PAGER read and write files in your repository.</p>
      </li>
      <li>
        <strong>Click Generate token</strong>
        <p>Copy the token immediately. GitHub only shows it once. Paste it into the login field.</p>
      </li>
    </ol>
    <div class="pat-note">
      Your token is stored in your browser's <code>localStorage</code> and sent only to <code>api.github.com</code>. It never touches any other server.
    </div>
  </div>
`;

export class LoginView {
  constructor(onAuth, workerUrl = '') {
    this.onAuth    = onAuth;
    this.workerUrl = workerUrl;
  }

  render() {
    const hasWorker = Boolean(this.workerUrl);
    return `
      <div class="login-screen">
        <div class="login-panel">

          <div class="login-mascot-wrap">
            <div class="login-retro-name">PAGER</div>
            <div class="login-retro-sub">★ github pages cms ★</div>
          </div>

          ${hasWorker ? `
            <button class="btn btn-primary login-github-btn" id="github-btn">
              Login with GitHub
            </button>

            <div class="device-code-screen" id="code-screen" style="display:none">
              <p class="device-instructions">
                Enter this code at <a href="https://github.com/login/device" target="_blank" rel="noopener" class="device-link">github.com/login/device ↗</a>
              </p>
              <div class="device-code-display" id="device-code-display"></div>
              <button class="btn btn-ghost btn-sm" id="cancel-device-btn">Cancel</button>
            </div>

            <div class="login-divider">
              <button class="btn-inline" id="toggle-pat-btn">Use a personal access token instead</button>
            </div>
          ` : ''}

          <div class="login-form" id="login-form" ${hasWorker ? 'style="display:none"' : ''}>
            <div class="field">
              <label>GitHub Personal Access Token</label>
              <input
                type="password"
                id="pat-input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autocomplete="off"
                spellcheck="false"
              >
            </div>
            <div id="login-error" class="login-error" style="display:none"></div>
            <button class="btn btn-primary" id="login-btn" type="button">Connect</button>
          </div>

          ${!hasWorker ? `
            <p class="login-hint">
              No token? <button class="btn-inline" id="guide-btn">How to get one ↗</button>
            </p>
          ` : ''}

        </div>
      </div>

      <div class="guide-backdrop" id="guide-backdrop" style="display:none">
        <div class="guide-panel">
          ${GUIDE_HTML}
        </div>
      </div>
    `;
  }

  bind(container) {
    const err      = container.querySelector('#login-error');
    const loginBtn = container.querySelector('#login-btn');
    const input    = container.querySelector('#pat-input');

    // Guide (PAT instructions)
    const guideBtn = container.querySelector('#guide-btn');
    const backdrop = container.querySelector('#guide-backdrop');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => { backdrop.style.display = 'flex'; });
      backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.style.display = 'none'; });
      backdrop.querySelector('#guide-close').addEventListener('click', () => { backdrop.style.display = 'none'; });
    }

    // PAT toggle (when device flow is primary)
    const togglePatBtn = container.querySelector('#toggle-pat-btn');
    const loginForm    = container.querySelector('#login-form');
    if (togglePatBtn) {
      togglePatBtn.addEventListener('click', () => {
        const visible = loginForm.style.display !== 'none';
        loginForm.style.display = visible ? 'none' : 'flex';
        togglePatBtn.textContent = visible
          ? 'Use a personal access token instead'
          : 'Hide token form';
        if (!visible) input?.focus();
      });
    }

    // PAT login
    if (loginBtn) {
      const attempt = async () => {
        const token = input.value.trim();
        if (!token) return;
        loginBtn.disabled    = true;
        loginBtn.textContent = 'Connecting…';
        err.style.display    = 'none';
        try {
          await this.onAuth(token);
        } catch (e) {
          err.textContent      = e.message || 'Authentication failed. Check your token and try again.';
          err.style.display    = 'block';
          loginBtn.disabled    = false;
          loginBtn.textContent = 'Connect';
          input.focus();
        }
      };
      loginBtn.addEventListener('click', attempt);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    }

    // Device flow
    const githubBtn  = container.querySelector('#github-btn');
    const codeScreen = container.querySelector('#code-screen');
    const cancelBtn  = container.querySelector('#cancel-device-btn');
    if (githubBtn) {
      let cancelled = false;
      githubBtn.addEventListener('click', async () => {
        cancelled = false;
        githubBtn.disabled    = true;
        githubBtn.textContent = 'Connecting…';
        try {
          await this.#deviceFlow(container, () => cancelled);
        } catch (e) {
          if (!cancelled) {
            // Show error in the PAT form's error slot (ensure it's visible)
            loginForm.style.display = 'flex';
            if (err) {
              err.textContent   = e.message || 'Login failed. Try again.';
              err.style.display = 'block';
            }
          }
          githubBtn.disabled    = false;
          githubBtn.textContent = 'Login with GitHub';
          if (codeScreen) codeScreen.style.display = 'none';
        }
      });
      cancelBtn?.addEventListener('click', () => {
        cancelled = true;
        codeScreen.style.display = 'none';
        githubBtn.style.display  = 'flex';
        githubBtn.disabled       = false;
        githubBtn.textContent    = 'Login with GitHub';
      });
    }

    if (!this.workerUrl) input?.focus();
  }

  async #deviceFlow(container, isCancelled) {
    const githubBtn   = container.querySelector('#github-btn');
    const codeScreen  = container.querySelector('#code-screen');
    const codeDisplay = container.querySelector('#device-code-display');

    // Request device code from worker
    const codeRes = await fetch(`${this.workerUrl}/device/code`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    'scope=repo',
    });

    if (!codeRes.ok) throw new Error('Failed to start GitHub login. Check the worker is deployed.');

    const { device_code, user_code, interval = 5, expires_in = 900 } = await codeRes.json();

    if (!device_code) throw new Error('GitHub did not return a device code. Is the OAuth App configured?');

    // Show the code screen
    codeDisplay.textContent  = user_code;
    githubBtn.style.display  = 'none';
    codeScreen.style.display = 'block';

    // Poll until authorised or cancelled
    const token = await this.#pollToken(device_code, interval * 1000, expires_in * 1000, isCancelled);

    if (isCancelled()) return;

    githubBtn.style.display  = 'flex';
    codeScreen.style.display = 'none';

    await this.onAuth(token);
  }

  async #pollToken(deviceCode, intervalMs, expiresMs, isCancelled) {
    const deadline = Date.now() + expiresMs;
    let delay = intervalMs;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, delay));
      if (isCancelled()) return null;

      const res = await fetch(`${this.workerUrl}/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          device_code: deviceCode,
          grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
        }).toString(),
      });

      const data = await res.json();

      if (data.access_token)              return data.access_token;
      if (data.error === 'slow_down')     { delay += 5000; continue; }
      if (data.error === 'expired_token') throw new Error('Login code expired. Try again.');
      if (data.error === 'access_denied') throw new Error('Access denied.');
      // authorization_pending — keep polling
    }

    throw new Error('Login timed out. Try again.');
  }
}
