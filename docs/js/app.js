import { CONFIG }      from './config.js';
import { GitHubClient } from './github.js';
import { LoginView }    from './views/login.js';
import { PostsView }    from './views/posts.js';
import { PagesView }    from './views/pages.js';
import { EditorView }   from './views/editor.js';
import { MediaView }    from './views/media.js';
import { SetupView }    from './views/setup.js';

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  token:      null,
  client:     null,
  user:       null,
  route:      null,
  params:     {},
  repoConfig: null,
};

// ── Toast ────────────────────────────────────────────────────────────────────

let toastContainer;

function toast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Repo config ──────────────────────────────────────────────────────────────

const TOKEN_KEY       = 'cms_gh_token';
const REPO_CONFIG_KEY = 'cms_repo_config';

function loadRepoConfig() {
  try {
    const raw = localStorage.getItem(REPO_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function applyRepoConfig(cfg) {
  state.repoConfig = cfg;
  localStorage.setItem(REPO_CONFIG_KEY, JSON.stringify(cfg));
  state.client = new GitHubClient(state.token, cfg.owner, cfg.repo, cfg.branch);
  // Update the repo label in the shell without a full re-render
  const repoEl = document.querySelector('.user-repo');
  if (repoEl) repoEl.textContent = `${cfg.owner}/${cfg.repo}`;
  navigate('posts');
}

function getViewConfig() {
  return { ...CONFIG, ...(state.repoConfig ?? {}) };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate(token) {
  const tempClient = new GitHubClient(token, '', '', '');
  const user       = await tempClient.getUser();
  state.token  = token;
  state.user   = user;
  localStorage.setItem(TOKEN_KEY, token);

  const saved = loadRepoConfig();
  if (saved) {
    state.repoConfig = saved;
    state.client = new GitHubClient(token, saved.owner, saved.repo, saved.branch);
    renderShell();
    navigate('posts');
  } else {
    state.client = tempClient;
    renderShell();
    navigate('setup');
  }
}

function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REPO_CONFIG_KEY);
  state.token      = null;
  state.client     = null;
  state.user       = null;
  state.repoConfig = null;
  renderLogin();
}

// ── Router ───────────────────────────────────────────────────────────────────

function navigate(route, params = {}) {
  // Guard: require repo config for content routes
  if (route !== 'setup' && !state.repoConfig) {
    route  = 'setup';
    params = {};
  }

  state.route  = route;
  state.params = params;

  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  const main = document.getElementById('main');
  renderView(main, route, params);
}

function renderView(container, route, params) {
  const cfg = getViewConfig();
  let view;

  switch (route) {
    case 'setup':
      view = new SetupView(state.client, CONFIG, {
        toast,
        onDone:        applyRepoConfig,
        initialValues: state.repoConfig ?? null,
      });
      break;

    case 'posts':
      view = new PostsView(state.client, cfg, {
        toast,
        onEdit:    path    => navigate('editor', { path }),
        onNew:     ()      => navigate('editor', { path: null }),
        onDraft:   draftId => navigate('editor', { path: null, draftId }),
        onSetup:   ()      => navigate('setup'),
        onUsePath: path    => applyRepoConfig({ ...state.repoConfig, postsPath: path }),
      });
      break;

    case 'pages':
      view = new PagesView(state.client, cfg, {
        toast,
        onEdit: path     => navigate('editor', { path, backRoute: 'pages' }),
        onNew:  fileType => navigate('editor', { path: null, fileType, backRoute: 'pages' }),
      });
      break;

    case 'editor':
      view = new EditorView(state.client, cfg, {
        toast,
        path:     params.path     ?? null,
        draftId:  params.draftId  ?? null,
        fileType: params.fileType ?? null,
        onBack:   () => navigate(params.backRoute ?? 'posts'),
        onMediaPick: callback => showMediaPicker(callback),
      });
      break;

    case 'media':
      view = new MediaView(state.client, cfg, { toast });
      break;

    default:
      container.innerHTML = '<div class="empty-state"><p>Not found.</p></div>';
      return;
  }

  container.innerHTML = view.render();
  view.bind(container);
}

// ── Media picker overlay ──────────────────────────────────────────────────────

function showMediaPicker(callback) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.style.cssText = 'background:rgba(0,0,0,.85); z-index:200;';

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: var(--bg);
    border: 1px solid var(--border);
    width: 90vw;
    max-width: 900px;
    height: 80vh;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const view = new MediaView(state.client, getViewConfig(), {
    toast,
    pickMode: true,
    onPick: (path) => {
      overlay.remove();
      if (path) callback(path);
    },
  });

  panel.innerHTML = view.render();
  view.bind(panel);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function renderShell() {
  const { user } = state;
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const repoLabel = state.repoConfig
    ? `${esc(state.repoConfig.owner)}/${esc(state.repoConfig.repo)}`
    : 'No repo configured';

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="wordmark">PAGER</div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section">
            <div class="nav-section-label">Content</div>
            <button class="nav-item" data-route="posts">
              ${iconPost()}
              Posts
            </button>
            <button class="nav-item" data-route="editor" data-new="1">
              ${iconNew()}
              New post
            </button>
          </div>
          <div class="nav-section">
            <div class="nav-section-label">Pages</div>
            <button class="nav-item" data-route="pages">
              ${iconPages()}
              Pages
            </button>
            <button class="nav-item" data-route="editor" data-new="1" data-filetype="html">
              ${iconNew()}
              New page
            </button>
          </div>
          <div class="nav-section">
            <div class="nav-section-label">Assets</div>
            <button class="nav-item" data-route="media">
              ${iconMedia()}
              Media
            </button>
          </div>
        </nav>
        <div class="sidebar-footer">
          <div class="avatar">
            ${user.avatar_url
              ? `<img src="${esc(user.avatar_url)}" alt="${esc(user.login)}">`
              : ''}
          </div>
          <div class="user-info">
            <div class="username">${esc(user.login)}</div>
            <button class="user-repo btn-inline" data-route="setup" title="Change repository">${repoLabel}</button>
          </div>
          <button class="btn btn-ghost btn-sm sign-out" id="sign-out-btn" title="Sign out">↩</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
    <nav class="mobile-nav" id="mobile-nav">
      <button class="mobile-nav-item" data-route="posts">
        ${iconPost()}
        <span>Posts</span>
      </button>
      <button class="mobile-nav-item" data-route="pages">
        ${iconPages()}
        <span>Pages</span>
      </button>
      <button class="mobile-nav-item" data-route="editor" data-new="1">
        ${iconNew()}
        <span>New</span>
      </button>
      <button class="mobile-nav-item" data-route="media">
        ${iconMedia()}
        <span>Media</span>
      </button>
      <button class="mobile-nav-item" id="mobile-sign-out-btn">
        ${iconSignOut()}
        <span>Sign out</span>
      </button>
    </nav>
  `;

  document.getElementById('sign-out-btn').addEventListener('click', signOut);
  document.getElementById('mobile-sign-out-btn').addEventListener('click', signOut);

  document.querySelectorAll('.nav-item[data-route], .mobile-nav-item[data-route], .user-repo[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      const route    = el.dataset.route;
      const isNew    = el.dataset.new === '1';
      const fileType = el.dataset.filetype ?? null;
      if (isNew) {
        navigate(route, { path: null, fileType, backRoute: fileType ? 'pages' : 'posts' });
      } else {
        navigate(route, {});
      }
    });
  });
}

// ── Login screen ──────────────────────────────────────────────────────────────

function renderLogin() {
  const app  = document.getElementById('app');
  const view = new LoginView(authenticate, CONFIG.workerUrl, CONFIG.githubClientId, CONFIG.githubAppSlug, signOut);
  app.innerHTML = view.render();
  view.bind(app);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  // Handle GitHub OAuth callback (?code=…&state=…)
  const params     = new URLSearchParams(location.search);
  const code       = params.get('code');
  const oauthState = params.get('state');
  const oauthError = params.get('error');

  if (code || oauthError) {
    history.replaceState(null, '', location.pathname);

    if (oauthError) {
      renderLogin();
      toast(`GitHub login failed: ${params.get('error_description') || oauthError}`, 'error');
      return;
    }

    const savedState = sessionStorage.getItem('pager_oauth_state');
    sessionStorage.removeItem('pager_oauth_state');

    if (oauthState !== savedState) {
      renderLogin();
      toast('Login failed: invalid state. Please try again.', 'error');
      return;
    }

    try {
      const res  = await fetch(`${CONFIG.workerUrl}/exchange`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `code=${encodeURIComponent(code)}`,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await authenticate(data.token);
      return;
    } catch (e) {
      renderLogin();
      toast(`Login failed: ${e.message}`, 'error');
      return;
    }
  }

  const stored = localStorage.getItem(TOKEN_KEY);

  if (stored) {
    // OAuth App tokens (gho_) won't work with the GitHub App flow — clear them.
    if (stored.startsWith('gho_')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REPO_CONFIG_KEY);
      renderLogin();
      toast('Please log in again — the auth flow has been updated.', 'info');
      return;
    }

    try {
      await authenticate(stored);
      return;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REPO_CONFIG_KEY);
    }
  }

  renderLogin();
}

boot();

// ── Icons ─────────────────────────────────────────────────────────────────────

function iconPost() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>`;
}

function iconNew() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;
}

function iconPages() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
  </svg>`;
}

function iconMedia() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>`;
}

function iconSignOut() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>`;
}
