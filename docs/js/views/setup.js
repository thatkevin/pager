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

const PAGES_CANDIDATES = [
  '_pages',
  'pages',
  '_docs',
  'docs',
  'content/pages',
];

// Layouts for common gem-based themes whose _layouts/ dir is empty locally.
const THEME_LAYOUTS = {
  'minima':                ['home', 'post', 'page', 'default'],
  'minimal-mistakes':      ['home', 'single', 'page', 'archive', 'search', 'posts', 'default'],
  'minimal-mistakes-jekyll': ['home', 'single', 'page', 'archive', 'search', 'posts', 'default'],
  'just-the-docs':         ['default', 'page', 'home', 'minimal'],
  'chirpy':                ['home', 'post', 'page', 'archives', 'categories', 'tags', 'about', 'default'],
  'beautiful-jekyll':      ['home', 'post', 'page', 'minimal', 'default'],
  'al-folio':              ['about', 'post', 'page', 'cv', 'bib', 'default'],
  'academic-pages':        ['archive', 'single', 'talk', 'post', 'page', 'default'],
  'hacker':                ['default'],
  'cayman':                ['default'],
  'architect':             ['default'],
  'slate':                 ['default'],
  'midnight':              ['default'],
  'merlot':                ['default'],
  'modernist':             ['default'],
  'leap-day':              ['default'],
  'time-machine':          ['default'],
};

const PAGER_CMS_PATH = '.pagercms';

function parseConfigYml(text) {
  const scalar = key => {
    const m = text.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'));
    return m ? m[1].trim() : null;
  };
  // remote_theme is often "user/repo" or "user/repo@ref" — extract the repo slug as theme name
  const remoteTheme = scalar('remote_theme');
  const themeName   = scalar('theme')
    ?? (remoteTheme ? remoteTheme.split('/').pop().split('@')[0].replace(/-jekyll$/, '') : null);
  return {
    theme:          themeName,
    baseurl:        scalar('baseurl') ?? '',
    url:            scalar('url') ?? '',
    collectionsDir: scalar('collections_dir') ?? '',
  };
}

export class SetupView {
  constructor(client, config, { toast, onDone, initialValues = null, recentRepos = [] }) {
    this.client        = client;
    this.config        = config;
    this.toast         = toast;
    this.onDone        = onDone;
    this.initialValues = initialValues;
    this.recentRepos   = recentRepos;
    this.repos         = [];
    this.selected      = null;
    this._el           = null;
    this._pagerCmsSha  = null;
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
              <span class="setup-pager-source" id="setup-pager-source" style="display:none">From .pagercms</span>
            </div>

            <div class="field">
              <label>Branch</label>
              <input type="text" id="setup-branch" value="${iv?.branch ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Posts folder</label>
              <input type="text" id="setup-posts-path" value="${iv?.postsPath ?? ''}"
                     placeholder="e.g. _posts — leave blank if posts are in the repo root" autocomplete="off">
            </div>
            <div class="field">
              <label>Pages folder <span class="field-hint">(HTML &amp; standalone pages)</span></label>
              <input type="text" id="setup-pages-path" value="${iv?.pagesPath ?? ''}"
                     placeholder="e.g. _pages — leave blank if pages live at repo root" autocomplete="off">
            </div>
            <div class="field">
              <label>Media folder</label>
              <input type="text" id="setup-media-path" value="${iv?.mediaPath ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Layouts <span class="field-hint">(comma-separated)</span></label>
              <input type="text" id="setup-layouts" value="${iv?.layouts?.join(', ') ?? ''}" autocomplete="off">
            </div>
            <div class="field">
              <label>Max image width <span class="field-hint">(px, leave blank to keep originals)</span></label>
              <input type="text" inputmode="numeric" id="setup-max-img-width"
                     value="${iv?.maxImageWidth ?? ''}" placeholder="e.g. 1200" autocomplete="off">
            </div>

            <label class="setup-save-label">
              <input type="checkbox" id="setup-save-pager" ${iv ? '' : 'checked'}>
              Save settings to <code>.pagercms</code> in this repo
            </label>

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

    if (this.initialValues) {
      const { owner, repo, branch } = this.initialValues;
      this.selected = { full_name: `${owner}/${repo}` };
      // Fetch existing .pagercms sha so we can update rather than clobber
      this.client.withRepo(owner, repo, branch)
        .getFile(PAGER_CMS_PATH)
        .then(f => { this._pagerCmsSha = f.sha; })
        .catch(() => { this._pagerCmsSha = null; });
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
      
      // Sort: Recents first (in order of recency), then alphabetical
      merged.sort((a, b) => {
        const idxA = this.recentRepos.indexOf(a.full_name);
        const idxB = this.recentRepos.indexOf(b.full_name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.full_name.localeCompare(b.full_name);
      });
      
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

    listEl.innerHTML = hits.map(r => {
      const isRecent = this.recentRepos.includes(r.full_name);
      return `
        <button class="repo-item${this.selected?.full_name === r.full_name ? ' active' : ''}"
                data-name="${r.full_name}"
                data-branch="${r.default_branch ?? 'main'}">
          <span class="repo-item-name">
            ${isRecent ? '<span class="repo-item-recent-star">★</span> ' : ''}${r.full_name}
          </span>
          ${r.private ? '<span class="repo-item-badge">private</span>' : ''}
        </button>
      `;
    }).join('');

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
    this._el.querySelector('#setup-pager-source').style.display = 'none';

    this._el.querySelectorAll('.repo-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.name === fullName);
    });

    const detectingEl = this._el.querySelector('#setup-detecting');
    detectingEl.style.display = 'inline';
    this._el.querySelector('#setup-confirm-btn').disabled = true;
    this._el.querySelector('#setup-branch').value = defaultBranch;

    const [owner, repo] = fullName.split('/');
    const tempClient    = this.client.withRepo(owner, repo, defaultBranch);

    // Try .pagercms first — skip detection if found
    try {
      const pagerFile = await tempClient.getFile(PAGER_CMS_PATH);
      const cfg       = JSON.parse(pagerFile.content);
      this._pagerCmsSha = pagerFile.sha;

      const branch = cfg.branch ?? defaultBranch;
      const postsPath = cfg.postsPath ?? '';
      const pagesPath = cfg.pagesPath ?? '';
      const mediaPath = cfg.mediaPath ?? '';
      const layouts = Array.isArray(cfg.layouts) ? cfg.layouts : ['post', 'page', 'default'];
      const maxImageWidth = cfg.maxImageWidth ?? null;

      // Update form just in case user wants to see it, though we auto-confirm
      this._el.querySelector('#setup-branch').value = branch;
      this._el.querySelector('#setup-posts-path').value = postsPath;
      this._el.querySelector('#setup-pages-path').value = pagesPath;
      this._el.querySelector('#setup-media-path').value = mediaPath;
      this._el.querySelector('#setup-layouts').value    = layouts.join(', ');
      this._el.querySelector('#setup-max-img-width').value = maxImageWidth ?? '';

      detectingEl.style.display = 'none';
      this.toast(`Using configuration from .pagercms`, 'info');
      
      // Auto-confirm if we found a valid .pagercms
      this.onDone({ owner, repo, branch, postsPath, pagesPath, mediaPath, layouts, maxImageWidth });
      return;
    } catch {
      this._pagerCmsSha = null;
    }

    // No .pagercms — auto-detect from repo structure
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
      const [postsResults, mediaResults, pagesResults, layoutFiles, configYmlText] = await Promise.all([
        Promise.all(POSTS_CANDIDATES.map(p => probe(p).then(ok => ok ? p : null))),
        Promise.all(MEDIA_CANDIDATES.map(p => probe(p).then(ok => ok ? p : null))),
        Promise.all(PAGES_CANDIDATES.map(p => probe(p).then(ok => ok ? p : null))),
        tempClient.listDir('_layouts').catch(() => []),
        tempClient.getConfigYml().catch(() => null),
      ]);

      const cfg       = configYmlText ? parseConfigYml(configYmlText) : {};
      const postsPath = postsResults.find(Boolean) ?? fallback.postsPath;
      const mediaPath = mediaResults.find(Boolean) ?? fallback.mediaPath;
      const pagesPath = pagesResults.find(Boolean) ?? '';

      let layouts = fallback.layouts;
      if (Array.isArray(layoutFiles) && layoutFiles.length) {
        const detected = layoutFiles
          .filter(f => f.type === 'file' && f.name.match(/\.(html|liquid|erb|md)$/))
          .map(f => f.name.replace(/\.[^.]+$/, ''));
        if (detected.length) layouts = detected;
      } else if (cfg.theme && THEME_LAYOUTS[cfg.theme]) {
        layouts = THEME_LAYOUTS[cfg.theme];
      }

      this._el.querySelector('#setup-posts-path').value = postsPath;
      this._el.querySelector('#setup-media-path').value = mediaPath;
      this._el.querySelector('#setup-pages-path').value = pagesPath;
      this._el.querySelector('#setup-layouts').value    = layouts.join(', ');
    } catch {
      this._el.querySelector('#setup-posts-path').value = fallback.postsPath;
      this._el.querySelector('#setup-media-path').value = fallback.mediaPath;
      this._el.querySelector('#setup-pages-path').value = '';
      this._el.querySelector('#setup-layouts').value    = fallback.layouts.join(', ');
    }

    this._el.querySelector('#setup-save-pager').checked = true;
    detectingEl.style.display = 'none';
    this._el.querySelector('#setup-confirm-btn').disabled = false;
    configPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async _confirm() {
    if (!this.selected) {
      this.toast('Select a repository first', 'error');
      return;
    }
    const branch        = this._el.querySelector('#setup-branch').value.trim()      || 'main';
    const postsPath     = this._el.querySelector('#setup-posts-path').value.trim();
    const pagesPath     = this._el.querySelector('#setup-pages-path').value.trim();
    const mediaPath     = this._el.querySelector('#setup-media-path').value.trim()  || 'assets/images';
    const layoutRaw     = this._el.querySelector('#setup-layouts').value.trim();
    const layouts       = layoutRaw ? layoutRaw.split(',').map(s => s.trim()).filter(Boolean) : ['post', 'page', 'default'];
    const maxImgRaw     = parseInt(this._el.querySelector('#setup-max-img-width').value, 10);
    const maxImageWidth = maxImgRaw > 0 ? maxImgRaw : null;
    const [owner, repo] = this.selected.full_name.split('/');

    if (this._el.querySelector('#setup-save-pager')?.checked) {
      const cfg = { version: '0.1', branch, postsPath, pagesPath, mediaPath, layouts };
      if (maxImageWidth) cfg.maxImageWidth = maxImageWidth;
      try {
        const saveClient = this.client.withRepo(owner, repo, branch);
        await saveClient.writeFile(
          PAGER_CMS_PATH,
          JSON.stringify(cfg, null, 2) + '\n',
          this._pagerCmsSha ? 'Update PAGER CMS config' : 'Add PAGER CMS config',
          this._pagerCmsSha,
        );
        this.toast('Settings saved to .pagercms', 'success');
      } catch (e) {
        this.toast(`Could not save .pagercms: ${e.message}`, 'error');
      }
    }

    this.onDone({ owner, repo, branch, postsPath, pagesPath, mediaPath, layouts, maxImageWidth });
  }
}
