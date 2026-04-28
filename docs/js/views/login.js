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
            <div class="login-logo-wrap">
              <svg class="login-logo" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="64" height="64" viewBox="0 0 128 128"><path fill="#bdcf46" d="M113.87 67.58c0 3.72-3.05 6.77-6.77 6.77H20.89c-3.73 0-6.77-3.05-6.77-6.77V36.27c0-3.72 3.04-6.77 6.77-6.77h86.21c3.72 0 6.77 3.05 6.77 6.77z"></path><path fill="#78a3ad" d="M116.66 18.71H11.34C5.37 18.71.48 23.59.48 29.57v68.85c0 5.97 4.88 10.86 10.86 10.86h105.32c5.98 0 10.86-4.89 10.86-10.86V29.57c0-5.97-4.88-10.86-10.86-10.86m-2.79 48.87c0 3.72-3.05 6.77-6.77 6.77H20.89c-3.73 0-6.77-3.05-6.77-6.77V36.27c0-3.72 3.04-6.77 6.77-6.77h86.21c3.72 0 6.77 3.05 6.77 6.77z"></path><path fill="#2f2f2f" d="M24.54 49.75c.2-.2.38-.49.51-.86c.57-1.59.48-4.18-.21-5.63c-.31-.63-.87-.95-1.35-.77c-.69.25-1.13.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.38 1.43 1.46 1.82 2.2 1.06m9.3-7.27c-.71.25-1.14.91-1.35 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.21 1.06c.21-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.31-.63-.87-.94-1.35-.77m-9 13.25c-.31-.63-.87-.95-1.35-.77c-.69.25-1.13.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.55-1.58.46-4.17-.23-5.63m9-.77c-.71.25-1.14.91-1.35 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.21 1.06c.21-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.31-.63-.87-.94-1.35-.77m-7.97-3.47c-.63.3-.95.86-.77 1.35c.25.69.92 1.13 2.04 1.34c1.3.24 2.93.15 4.17-.18c1.42-.39 1.82-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.59-.56-4.18-.47-5.63.22m1.26-9.94c1.3.24 2.93.15 4.17-.18c1.42-.39 1.82-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.59-.56-4.18-.48-5.63.21c-.63.3-.95.87-.77 1.35c.25.71.92 1.15 2.04 1.35m4.37 22.36c-1.59-.56-4.18-.48-5.63.22c-.63.3-.95.86-.77 1.35c.25.7.92 1.13 2.04 1.34c1.3.24 2.93.15 4.17-.18c1.42-.39 1.82-1.47 1.06-2.22c-.22-.2-.5-.37-.87-.51m11.02-14.16c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.3-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.24 1.3-.15 2.93.18 4.16c.38 1.43 1.46 1.82 2.21 1.06m9.29-7.27c-.7.25-1.13.91-1.34 2.04c-.24 1.3-.16 2.93.18 4.16c.4 1.43 1.48 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.22-5.63c-.3-.63-.86-.94-1.35-.77m-9 13.25c-.3-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.24 1.3-.15 2.93.18 4.16c.39 1.43 1.48 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.58.48-4.17-.22-5.63m9-.77c-.7.25-1.13.91-1.34 2.04c-.24 1.3-.16 2.93.18 4.16c.4 1.43 1.48 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.22-5.63c-.3-.63-.86-.94-1.35-.77m-7.97-3.47c-.63.3-.95.86-.78 1.35c.25.69.92 1.13 2.05 1.34c1.3.24 2.93.15 4.16-.18c1.44-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.38-.86-.51c-1.59-.56-4.17-.47-5.63.22m1.27-9.94c1.3.24 2.93.15 4.16-.18c1.44-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.38-.86-.51c-1.59-.56-4.17-.48-5.63.21c-.63.3-.95.87-.78 1.35c.25.71.92 1.15 2.05 1.35m4.36 22.36c-1.59-.56-4.17-.48-5.63.22c-.63.3-.95.86-.78 1.35c.25.7.92 1.13 2.05 1.34c1.3.24 2.93.15 4.16-.18c1.44-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.37-.86-.51M60.5 49.75c.2-.2.37-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.3-.63-.86-.95-1.35-.77c-.7.25-1.13.91-1.34 2.04c-.24 1.3-.16 2.93.18 4.16c.38 1.43 1.46 1.82 2.21 1.06m9.29-7.27c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.21 1.06c.21-.2.38-.49.51-.86c.56-1.59.47-4.18-.21-5.63c-.32-.63-.88-.94-1.36-.77m-9 13.25c-.3-.63-.86-.95-1.35-.77c-.7.25-1.13.91-1.34 2.04c-.24 1.3-.16 2.93.18 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.37-.49.51-.86c.56-1.58.47-4.17-.22-5.63m9-.77c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.21 1.06c.21-.2.38-.49.51-.86c.56-1.59.47-4.18-.21-5.63c-.32-.63-.88-.94-1.36-.77m-7.98-3.47c-.63.3-.95.86-.77 1.35c.25.69.91 1.13 2.04 1.34c1.3.24 2.92.15 4.17-.18c1.43-.39 1.82-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.58-.56-4.17-.47-5.63.22m1.27-9.94c1.3.24 2.92.15 4.17-.18c1.43-.39 1.82-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.59-.56-4.18-.48-5.63.21c-.63.3-.95.87-.77 1.35c.25.71.91 1.15 2.04 1.35m4.37 22.36c-1.59-.56-4.18-.48-5.63.22c-.63.3-.95.86-.77 1.35c.25.7.91 1.13 2.04 1.34c1.3.24 2.92.15 4.17-.18c1.43-.39 1.82-1.47 1.06-2.22q-.315-.3-.87-.51m11.02-14.16c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.3-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.38 1.43 1.45 1.82 2.2 1.06m9.29-7.27c-.69.25-1.13.91-1.34 2.04c-.24 1.3-.15 2.93.18 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.31-.63-.87-.94-1.36-.77m-9 13.25c-.3-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.21 1.06c.2-.2.38-.49.51-.86c.56-1.58.48-4.17-.22-5.63m9-.77c-.69.25-1.13.91-1.34 2.04c-.24 1.3-.15 2.93.18 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.21-5.63c-.31-.63-.87-.94-1.36-.77m-7.97-3.47c-.63.3-.94.86-.77 1.35c.25.69.91 1.13 2.04 1.34c1.3.24 2.93.15 4.16-.18c1.43-.39 1.81-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.58-.56-4.16-.47-5.62.22m1.27-9.94c1.3.24 2.93.15 4.16-.18c1.43-.39 1.81-1.47 1.06-2.22c-.21-.2-.49-.38-.87-.51c-1.59-.56-4.17-.48-5.63.21c-.63.3-.94.87-.77 1.35c.26.71.92 1.15 2.05 1.35m4.36 22.36c-1.59-.56-4.17-.48-5.63.22c-.63.3-.94.86-.77 1.35c.25.7.91 1.13 2.04 1.34c1.3.24 2.93.15 4.16-.18c1.43-.39 1.81-1.47 1.06-2.22c-.21-.2-.49-.37-.86-.51m11.02-14.16c.2-.2.37-.49.51-.86c.56-1.59.48-4.18-.22-5.63c-.31-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.46 1.82 2.21 1.06m9.29-7.27c-.7.25-1.13.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.22-5.63c-.31-.63-.87-.94-1.36-.77m-8.99 13.25c-.31-.63-.87-.95-1.35-.77c-.7.25-1.14.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.46 1.82 2.22 1.06c.2-.2.37-.49.51-.86c.54-1.58.46-4.17-.23-5.63m8.99-.77c-.7.25-1.13.91-1.34 2.04c-.23 1.3-.15 2.93.19 4.16c.39 1.43 1.47 1.82 2.22 1.06c.2-.2.38-.49.51-.86c.56-1.59.48-4.18-.22-5.63c-.31-.63-.87-.94-1.36-.77m-7.97-3.47c-.63.3-.95.86-.77 1.35c.25.69.91 1.13 2.04 1.34c1.3.24 2.92.15 4.16-.18c1.43-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.38-.86-.51c-1.58-.56-4.17-.47-5.63.22m1.27-9.94c1.3.24 2.92.15 4.16-.18c1.43-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.38-.86-.51c-1.59-.56-4.17-.48-5.63.21c-.63.3-.95.87-.77 1.35c.25.71.91 1.15 2.04 1.35m4.37 22.36c-1.59-.56-4.17-.48-5.63.22c-.63.3-.95.86-.77 1.35c.25.7.91 1.13 2.04 1.34c1.3.24 2.92.15 4.16-.18c1.43-.39 1.82-1.47 1.06-2.22c-.2-.2-.49-.37-.86-.51"></path><circle cx="27.1" cy="89.68" r="6.97" fill="#fff"></circle><path fill="#fff" d="M49.9 95.16c-1.62-2.17-1.24-4.55-1.09-6.97l.06-.52c.21-1.04.86-1.94 2.17-2.23c1.77-.39 4.42 1.26 5.77 2.04c1.88 1.08 2.81 2.72 1.56 4.45c-1.11 1.53-3.65 4-5.92 4.29c-.99.13-2.04-.38-2.55-1.06m6.94-14.29c1.48-1.79 4.86-1.98 6.87-1.98c1.08 0 2.17.1 3.24.28c1.34.22 3.94.66 4.25 2.56c.15.92-.72 1.74-1.25 2.29c-1.91 1.99-4.06 3.96-6.85 3.34c-2.04-.45-4.9-1.81-6.17-3.76c-.56-.84-.77-1.89-.09-2.73m10.11 21.16c-1.07.18-2.15.28-3.24.28c-2.01 0-5.38-.19-6.87-1.98c-.69-.84-.47-1.89.08-2.73c1.27-1.95 4.13-3.31 6.17-3.76c2.79-.62 4.94 1.35 6.85 3.34c.54.55 1.4 1.37 1.25 2.29c-.31 1.9-2.9 2.33-4.24 2.56m11.08-6.87c-.51.68-1.56 1.19-2.56 1.06c-2.27-.29-4.8-2.76-5.92-4.29c-1.25-1.73-.32-3.37 1.56-4.45c1.35-.78 4.01-2.44 5.78-2.04c1.31.28 1.97 1.18 2.17 2.23l.06.52c.14 2.42.53 4.8-1.09 6.97"></path><circle cx="100.9" cy="89.68" r="6.97" fill="#fff"></circle></svg>
            </div>
            <div class="login-retro-name">PAGER</div>
            <div class="login-retro-sub">★ github pages cms ★</div>
            <p class="login-tagline">A markdown CMS for Jekyll-based GitHub Pages sites. Edit posts, pages, and media directly from your browser.</p>
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

          <p class="login-privacy-link"><a href="privacy.html">Privacy</a></p>

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
