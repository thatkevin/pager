const POSTS_CANDIDATES = [
  '_posts',
  'collections/_posts',
  'src/_posts',
  'source/_posts',
  'content/posts',
  'posts',
];

const MEDIA_CANDIDATES = [
  'assets/images',
  'assets/img',
  'images',
  'img',
  'media',
  'static/images',
  'public/images',
  'uploads',
];

export class SetupView {
  constructor(client, config, { toast, onDone, initialValues = null }) {
    this.client        = client;
    this.config        = config;
    this.toast         = toast;
    this.onDone        = onDone;
    this.initialValues = initialValues;
    this.repos         = [];
    this.selected      = null;
    this._el           = null;
  }

  render() {
    const iv = this.initialValues;
    return `
      <div class="setup-screen">
        <div class="setup-inner">
          <div class="setup-title">${iv ? 'Repository settings' : 'Choose a repository'}</div>
          <p class="setup-sub">${iv ? 'Edit settings for this repository.' : 'Select the GitHub repo you want PAGER to manage.'}</p>

          <div class="field">
            <label>Filter</label>
            <input type="text" id="setup-filter" placeholder="Search repositories…" autocomplete="off">
          </div>

          <div class="repo-list" id="repo-list">
            <div class="setup-state">Loading repositories…</div>
          </div>

          <details class="setup-manual">
            <summary>Type a repository manually</summary>
            <div class="setup-manual-row">
              <input type="text" id="manual-repo" placeholder="owner/repo" autocomplete="off" spellcheck="false">
              <button class="btn btn-ghost btn-sm" id="manual-use-btn">Use</button>
            </div>
          </details>

          <div id="setup-config" class="setup-config" style="${iv ? '' : 'display:none'}">
            <div class="setup-config-head">
              <span class="setup-config-repo" id="setup-repo-name">${iv ? `${iv.owner}/${iv.repo}` : ''}</span>
              <span class="setup-detecting" id="setup-detecting" style="display:none">Detecting…</span>
            </div>

            <div class="field">
              <label>Branch</label>
              <input type="text" id="setup-branch" value="${iv?.branch ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Posts folder</label>
              <input type="text" id="setup-posts-path" value="${iv?.postsPath ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Media folder</label>
              <input type="text" id="setup-media-path" value="${iv?.mediaPath ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Layouts (comma-separated)</label>
              <input type="text" id="setup-layouts" value="${iv?.layouts?.join(', ') ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Max image width (px)</label>
              <input type="number" id="setup-max-img-width" value="${iv?.maxImageWidth ?? ''}"
                     placeholder="e.g. 1200 — leave blank to keep originals" min="100" max="8000">
            </div>

            <button class="btn btn-primary" id="setup-confirm-btn">Continue</button>
          </div>
        </div>
      </div>
    `;
  }

  bind(el) {
    this._el = el;
    this._loadRepos();

    el.querySelector('#setup-filter').addEventListener('input', e => {
      this._renderList(e.target.value.toLowerCase());
    });

    const manualInput = el.querySelector('#manual-repo');
    el.querySelector('#manual-use-btn').addEventListener('click', () => {
      this._selectManual(manualInput.value.trim());
    });
    manualInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._selectManual(manualInput.value.trim());
    });

    el.querySelector('#setup-confirm-btn').addEventListener('click', () => this._confirm());

    // If editing existing config, mark it as selected without re-detecting
    if (this.initialValues) {
      const { owner, repo } = this.initialValues;
      this.selected = { full_name: `${owner}/${repo}` };
    }
  }

  async _loadRepos() {
    try {
      const [inst, user] = await Promise.all([
        this.client.listInstallationRepos().catch(() => []),
        this.client.listUserRepos().catch(() => []),
      ]);
      const seen   = new Set();
      const merged = [];
      for (const r of [...inst, ...user]) {
        if (!seen.has(r.full_name)) {
          seen.add(r.full_name);
          merged.push(r);
        }
      }
      merged.sort((a, b) => a.full_name.localeCompare(b.full_name));
      this.repos = merged;
    } catch {
      this.repos = [];
    }
    this._renderList('');
  }

  _renderList(filter) {
    const listEl = this._el.querySelector('#repo-list');
    const hits   = this.repos.filter(r => r.full_name.toLowerCase().includes(filter));

    if (!hits.length) {
      listEl.innerHTML = `<div class="setup-state">${
        this.repos.length ? 'No matches.' : 'No repositories found. Try typing one below.'
      }</div>`;
      return;
    }

    listEl.innerHTML = hits.map(r => `
      <button class="repo-item${this.selected?.full_name === r.full_name ? ' active' : ''}"
              data-name="${r.full_name}"
              data-branch="${r.default_branch ?? 'main'}">
        <span class="repo-item-name">${r.full_name}</span>
        ${r.private ? '<span class="repo-item-badge">private</span>' : ''}
      </button>
    `).join('');

    listEl.querySelectorAll('.repo-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = this.repos.find(x => x.full_name === btn.dataset.name);
        if (r) this._select(r.full_name, r.default_branch ?? 'main');
      });
    });
  }

  _selectManual(raw) {
    if (!raw) return;
    const parts = raw.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this.toast('Use owner/repo format, e.g. alice/my-blog', 'error');
      return;
    }
    this._select(raw, 'main');
  }

  async _select(fullName, defaultBranch) {
    this.selected = { full_name: fullName };

    const configPanel = this._el.querySelector('#setup-config');
    configPanel.style.display = 'block';
    this._el.querySelector('#setup-repo-name').textContent = fullName;

    this._el.querySelectorAll('.repo-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.name === fullName);
    });

    const detectingEl = this._el.querySelector('#setup-detecting');
    detectingEl.style.display = 'inline';
    this._el.querySelector('#setup-confirm-btn').disabled = true;

    this._el.querySelector('#setup-branch').value = defaultBranch;

    const [owner, repo] = fullName.split('/');
    const tempClient    = this.client.withRepo(owner, repo, defaultBranch);

    const probe = async path => {
      try { await tempClient.listDir(path); return true; } catch { return false; }
    };

    const { defaults } = this.config;
    const fallback = {
      postsPath: defaults?.postsPath ?? '_posts',
      mediaPath: defaults?.mediaPath ?? 'assets/images',
      layouts:   defaults?.layouts   ?? ['post', 'page', 'default'],
    };

    try {
      const [postsResults, mediaResults, layoutFiles] = await Promise.all([
        Promise.all(POSTS_CANDIDATES.map(p => probe(p).then(ok => ok ? p : null))),
        Promise.all(MEDIA_CANDIDATES.map(p => probe(p).then(ok => ok ? p : null))),
        tempClient.listDir('_layouts').catch(() => []),
      ]);

      const postsPath = postsResults.find(Boolean) ?? fallback.postsPath;
      const mediaPath = mediaResults.find(Boolean) ?? fallback.mediaPath;

      let layouts = fallback.layouts;
      if (Array.isArray(layoutFiles) && layoutFiles.length) {
        const detected = layoutFiles
          .filter(f => f.type === 'file' && f.name.match(/\.(html|liquid|erb|md)$/))
          .map(f => f.name.replace(/\.[^.]+$/, ''));
        if (detected.length) layouts = detected;
      }

      this._el.querySelector('#setup-posts-path').value = postsPath;
      this._el.querySelector('#setup-media-path').value = mediaPath;
      this._el.querySelector('#setup-layouts').value    = layouts.join(', ');
    } catch {
      this._el.querySelector('#setup-posts-path').value = fallback.postsPath;
      this._el.querySelector('#setup-media-path').value = fallback.mediaPath;
      this._el.querySelector('#setup-layouts').value    = fallback.layouts.join(', ');
    }

    detectingEl.style.display = 'none';
    this._el.querySelector('#setup-confirm-btn').disabled = false;
    configPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  _confirm() {
    if (!this.selected) {
      this.toast('Select a repository first', 'error');
      return;
    }
    const branch       = this._el.querySelector('#setup-branch').value.trim()     || 'main';
    const postsPath    = this._el.querySelector('#setup-posts-path').value.trim() || '_posts';
    const mediaPath    = this._el.querySelector('#setup-media-path').value.trim() || 'assets/images';
    const layoutRaw    = this._el.querySelector('#setup-layouts').value.trim();
    const layouts      = layoutRaw ? layoutRaw.split(',').map(s => s.trim()).filter(Boolean) : ['post', 'page', 'default'];
    const maxImgRaw    = parseInt(this._el.querySelector('#setup-max-img-width').value, 10);
    const maxImageWidth = maxImgRaw > 0 ? maxImgRaw : null;
    const [owner, repo] = this.selected.full_name.split('/');
    this.onDone({ owner, repo, branch, postsPath, mediaPath, layouts, maxImageWidth });
  }
}
