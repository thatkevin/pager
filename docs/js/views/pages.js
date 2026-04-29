export class PagesView {
  constructor(client, config, { toast, onEdit, onNew }) {
    this.client = client;
    this.config = config;
    this.toast  = toast;
    this.onEdit = onEdit;
    this.onNew  = onNew;
  }

  render() {
    return `
      <div class="posts-view">
        <div class="page-header">
          <h1>Pages</h1>
          <div class="actions">
            <button class="btn btn-ghost btn-sm" id="new-md-page-btn">New .md page</button>
            <button class="btn btn-primary" id="new-html-page-btn">+ New .html page</button>
          </div>
        </div>
        <div class="posts-table-wrap">
          <div class="loading-state" id="pages-loading">
            <div class="spinner"></div>
            <span>Loading pages…</span>
          </div>
          <table class="posts-table" id="pages-table" style="display:none">
            <thead>
              <tr>
                <th>Page</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="pages-tbody"></tbody>
          </table>
          <div class="empty-state" id="pages-empty" style="display:none">
            <p>No pages found. Create one or configure a pages folder in settings.</p>
          </div>
        </div>
      </div>
    `;
  }

  async bind(container) {
    container.querySelector('#new-html-page-btn').addEventListener('click', () => this.onNew('html'));
    container.querySelector('#new-md-page-btn').addEventListener('click',   () => this.onNew('md'));
    await this.#loadPages(container);
  }

  async #loadPages(container) {
    const loading = container.querySelector('#pages-loading');
    const table   = container.querySelector('#pages-table');
    const tbody   = container.querySelector('#pages-tbody');
    const empty   = container.querySelector('#pages-empty');

    try {
      const files = await this.#fetchPageFiles();

      loading.style.display = 'none';

      if (!files.length) {
        empty.style.display = 'block';
        return;
      }

      tbody.innerHTML = files.map(f => {
        const ext   = f.name.split('.').pop();
        const label = this.#displayName(f.name);
        return `
          <tr>
            <td>
              <div class="post-title">${label}</div>
              <div class="post-date mono">${f.path}</div>
            </td>
            <td><span class="file-type-badge">${ext}</span></td>
            <td>
              <div class="post-actions">
                <button class="btn btn-ghost btn-sm" data-path="${f.path}">Edit</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      table.style.display = '';

      tbody.querySelectorAll('[data-path]').forEach(btn => {
        btn.addEventListener('click', () => this.onEdit(btn.dataset.path));
      });

    } catch (e) {
      loading.innerHTML = `<span style="color:var(--red)">${e.message}</span>`;
    }
  }

  async #fetchPageFiles() {
    const isPageFile  = name => /\.(html?|md)$/i.test(name);
    const isNonPage   = name => /^(README|CONTRIBUTING|CHANGELOG|LICENSE|CODEOWNERS)(\..+)?$/i.test(name);
    const files = [];
    const seen  = new Set();

    const add = f => {
      if (!seen.has(f.path) && f.type === 'file' && isPageFile(f.name) && !isNonPage(f.name)) {
        seen.add(f.path);
        files.push(f);
      }
    };

    const pagesPath    = this.config.pagesPath;
    const hasPagePath  = typeof pagesPath === 'string'; // '' is valid (root)
    const pagesIsRoot  = pagesPath === '';

    const tasks = [];

    if (hasPagePath) {
      // List the configured pages folder (empty string = repo root for all page files)
      tasks.push(
        this.client.listDir(pagesPath)
          .then(list => list.forEach(add))
          .catch(() => {})
      );
    }

    // Root-level HTML files — only if pagesPath isn't already root
    if (!pagesIsRoot) {
      tasks.push(
        this.client.listDir('')
          .then(list => list
            .filter(f => f.type === 'file' && /\.(html?|md)$/i.test(f.name))
            .forEach(add)
          )
          .catch(() => {})
      );
    }

    await Promise.all(tasks);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  #displayName(filename) {
    return filename
      .replace(/\.(html?|md)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()) || filename;
  }
}
