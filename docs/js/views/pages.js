import { deleteDraft, draftsByPath } from '../drafts.js';

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
      <div class="pages-view">
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
      const pathDraftMap = draftsByPath();

      loading.style.display = 'none';

      if (!files.length) {
        empty.style.display = 'block';
        return;
      }

      tbody.innerHTML = '';
      for (const f of files) {
        const hasDraft = f.path in pathDraftMap;
        const tr = this.#renderPageRow(f, hasDraft);
        tbody.appendChild(tr);

        tr.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          this.onEdit(f.path);
        });

        tr.querySelector('.edit-btn').addEventListener('click', () => this.onEdit(f.path));
        tr.querySelector('.delete-btn').addEventListener('click', e => {
          e.stopPropagation();
          this.#confirmDelete(f, tr, pathDraftMap[f.path]);
        });
      }

      table.style.display = 'table';
    } catch (e) {
      loading.innerHTML = `<span style="color:var(--red)">${e.message}</span>`;
    }
  }

  #renderPageRow(f, hasDraft) {
    const tr    = document.createElement('tr');
    const ext   = f.name.split('.').pop();
    const label = this.#displayName(f.name);
    
    tr.innerHTML = `
      <td>
        <div class="post-title" style="display:flex;align-items:center;gap:8px">
          ${escHtml(label)}
          ${hasDraft ? '<span class="draft-badge">Draft</span>' : ''}
        </div>
        <div class="post-date mono">${escHtml(f.path)}</div>
      </td>
      <td><span class="file-type-badge">${escHtml(ext)}</span></td>
      <td>
        <div class="post-actions">
          <button class="btn btn-sm btn-ghost edit-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn">Delete</button>
        </div>
      </td>
    `;
    return tr;
  }

  async #confirmDelete(f, tr, draftId) {
    if (!confirm(`Delete "${this.#displayName(f.name)}"? This cannot be undone.`)) return;
    try {
      const file = await this.client.getFile(f.path);
      await this.client.deleteFile(f.path, file.sha, `Delete page: ${f.name}`);
      if (draftId) deleteDraft(draftId);
      tr.remove();
      this.toast('Page deleted.', 'success');
    } catch (e) {
      this.toast(`Delete failed: ${e.message}`, 'error');
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

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
