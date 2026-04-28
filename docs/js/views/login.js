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
  constructor(onAuth, workerUrl = '', githubClientId = '', githubAppSlug = '', onReset = null) {
    this.onAuth         = onAuth;
    this.workerUrl      = workerUrl;
    this.githubClientId = githubClientId;
    this.githubAppSlug  = githubAppSlug;
    this.onReset        = onReset;
  }

  render() {
    const hasOAuth = Boolean(this.workerUrl && this.githubClientId);
    return `
      <div class="login-screen">
        <div class="login-panel">

          <div class="login-mascot-wrap">
            <div class="login-retro-name">PAGER</div>
            <div class="login-retro-sub">★ github pages cms ★</div>
          </div>

          ${hasOAuth ? `
            <button class="btn btn-primary login-github-btn" id="github-btn">
              Login with GitHub
            </button>
            <div class="login-divider">
              <button class="btn-inline" id="toggle-pat-btn">Use a personal access token instead</button>
            </div>
          ` : ''}

          <div class="login-form" id="login-form" ${hasOAuth ? 'style="display:none"' : ''}>
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

          ${!hasOAuth ? `
            <p class="login-hint">
              No token? <button class="btn-inline" id="guide-btn">How to get one ↗</button>
            </p>
          ` : ''}

          <p class="login-reset-hint" id="reset-hint" style="display:none">
            Stuck? <button class="btn-inline" id="persistent-reset-btn">Clear saved session data</button>
          </p>

        </div>
      </div>

      <div class="guide-backdrop" id="guide-backdrop" style="display:none">
        <div class="guide-panel">
          ${GUIDE_HTML}
        </div>
      </div>
    `;
  }

  #showError(container, msg) {
    const err = container.querySelector('#login-error');
    if (!err) return;
    const resetHtml = this.onReset
      ? ` <button class="btn-inline" id="reset-btn">Start again</button>`
      : '';
    err.innerHTML    = `${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;')}${resetHtml}`;
    err.style.display = 'block';
    err.querySelector('#reset-btn')?.addEventListener('click', () => this.onReset());
  }

  bind(container) {
    const err      = container.querySelector('#login-error');
    const loginBtn = container.querySelector('#login-btn');
    const input    = container.querySelector('#pat-input');
    const loginForm = container.querySelector('#login-form');

    // Guide
    const guideBtn = container.querySelector('#guide-btn');
    const backdrop = container.querySelector('#guide-backdrop');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => { backdrop.style.display = 'flex'; });
      backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.style.display = 'none'; });
      backdrop.querySelector('#guide-close').addEventListener('click', () => { backdrop.style.display = 'none'; });
    }

    // PAT toggle
    const togglePatBtn = container.querySelector('#toggle-pat-btn');
    if (togglePatBtn) {
      togglePatBtn.addEventListener('click', () => {
        const visible = loginForm.style.display !== 'none';
        loginForm.style.display  = visible ? 'none' : 'flex';
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
          this.#showError(container, e.message || 'Authentication failed. Check your token and try again.');
          loginBtn.disabled    = false;
          loginBtn.textContent = 'Connect';
          input.focus();
        }
      };
      loginBtn.addEventListener('click', attempt);
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    }

    // GitHub OAuth redirect
    const githubBtn = container.querySelector('#github-btn');
    if (githubBtn) {
      githubBtn.addEventListener('click', () => {
        const state = crypto.randomUUID();
        sessionStorage.setItem('pager_oauth_state', state);
        const url = new URL('https://github.com/login/oauth/authorize');
        url.searchParams.set('client_id', this.githubClientId);
        url.searchParams.set('state', state);
        location.href = url.toString();
      });
    }

    if (!this.workerUrl) input?.focus();

    // Always-visible reset link so stuck users can clear state
    if (this.onReset) {
      const resetHint = container.querySelector('#reset-hint');
      const persistentReset = container.querySelector('#persistent-reset-btn');
      if (resetHint) resetHint.style.display = '';
      persistentReset?.addEventListener('click', () => this.onReset());
    }
  }
}
