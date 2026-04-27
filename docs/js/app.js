import { CONFIG }      from './config.js';
import { GitHubClient } from './github.js';
import { LoginView }    from './views/login.js';
import { PostsView }    from './views/posts.js';
import { EditorView }   from './views/editor.js';
import { MediaView }    from './views/media.js';

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  client:  null,
  user:    null,
  route:   null,
  params:  {},
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

// ── Auth ─────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'cms_gh_token';

async function authenticate(token) {
  const client = new GitHubClient(token, CONFIG.owner, CONFIG.repo, CONFIG.branch);
  const user   = await client.getUser();
  state.client = client;
  state.user   = user;
  localStorage.setItem(TOKEN_KEY, token);
  renderShell();
  navigate('posts');
}

function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  state.client = null;
  state.user   = null;
  renderLogin();
}

// ── Router ───────────────────────────────────────────────────────────────────

function navigate(route, params = {}) {
  state.route  = route;
  state.params = params;

  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  const main = document.getElementById('main');
  renderView(main, route, params);
}

function renderView(container, route, params) {
  let view;

  switch (route) {
    case 'posts':
      view = new PostsView(state.client, CONFIG, {
        toast,
        onEdit:  path    => navigate('editor', { path }),
        onNew:   ()      => navigate('editor', { path: null }),
        onDraft: draftId => navigate('editor', { path: null, draftId }),
      });
      break;

    case 'editor':
      view = new EditorView(state.client, CONFIG, {
        toast,
        path:    params.path    ?? null,
        draftId: params.draftId ?? null,
        onBack:  () => navigate('posts'),
        onMediaPick: callback => showMediaPicker(callback),
      });
      break;

    case 'media':
      view = new MediaView(state.client, CONFIG, { toast });
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

  const view = new MediaView(state.client, CONFIG, {
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
            <div class="repo">${esc(CONFIG.owner)}/${esc(CONFIG.repo)}</div>
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
      <button class="mobile-nav-item" data-route="editor" data-new="1">
        ${iconNew()}
        <span>New</span>
      </button>
      <button class="mobile-nav-item" data-route="media">
        ${iconMedia()}
        <span>Media</span>
      </button>
    </nav>
  `;

  document.getElementById('sign-out-btn').addEventListener('click', signOut);

  document.querySelectorAll('.nav-item[data-route], .mobile-nav-item[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      const isNew = el.dataset.new === '1';
      navigate(route, isNew ? { path: null } : {});
    });
  });
}

// ── Login screen ──────────────────────────────────────────────────────────────

function renderLogin() {
  const app  = document.getElementById('app');
  const view = new LoginView(authenticate, CONFIG.workerUrl);
  app.innerHTML = view.render();
  view.bind(app);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    try {
      await authenticate(stored);
      return;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
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

function iconMedia() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>`;
}
