import { filenameToMeta } from '../jekyll.js';
import { listDrafts, deleteDraft, draftsByPath } from '../drafts.js';

export class PostsView {
  constructor(client, config, { onEdit, onNew, onDraft, toast, onSetup }) {
    this.client  = client;
    this.config  = config;
    this.onEdit  = onEdit;
    this.onNew   = onNew;
    this.onDraft = onDraft;
    this.toast   = toast;
    this.onSetup = onSetup;
  }

  render() {
    return `
      <div class="posts-view">
        <div class="page-header">
          <h1>Posts</h1>
          <div class="actions">
            <button class="btn btn-primary" id="new-post-btn">+ New post</button>
          </div>
        </div>
        <div class="posts-table-wrap">
          <div class="loading-state" id="posts-loading">
            <div class="spinner"></div>
            <span>Loading posts…</span>
          </div>
          <table class="posts-table" id="posts-table" style="display:none">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="posts-tbody"></tbody>
          </table>
          <div class="empty-state" id="posts-empty" style="display:none">
            <p>No posts yet.</p>
          </div>
        </div>
      </div>
    `;
  }

  async bind(container) {
    container.querySelector('#new-post-btn').addEventListener('click', () => this.onNew());

    try {
      // Load local drafts and remote posts in parallel
      const [items] = await Promise.all([
        this.client.listDir(this.config.postsPath),
      ]);

      const drafts       = listDrafts();
      const pathDraftMap = draftsByPath();  // { filePath → draftId }

      // New-post drafts (never committed to GitHub)
      const newPostDrafts = drafts.filter(d => !d.path);

      // Published posts
      const posts = items
        .filter(i => i.type === 'file' && i.name.endsWith('.md'))
        .map(i => ({ ...filenameToMeta(i.name), path: i.path, sha: i.sha, name: i.name }))
        .sort((a, b) => b.date.localeCompare(a.date));

      container.querySelector('#posts-loading').style.display = 'none';

      if (!posts.length && !newPostDrafts.length) {
        container.querySelector('#posts-empty').style.display = 'flex';
        return;
      }

      const tbody = container.querySelector('#posts-tbody');
      container.querySelector('#posts-table').style.display = 'table';

      // Render new-post drafts at the top
      for (const draft of newPostDrafts) {
        const tr = this.#renderDraftRow(draft);
        tbody.appendChild(tr);
        tr.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          this.onDraft(draft.id);
        });
        tr.querySelector('.edit-btn').addEventListener('click', () => this.onDraft(draft.id));
        tr.querySelector('.delete-btn').addEventListener('click', e => {
          e.stopPropagation();
          if (!confirm(`Discard this draft?`)) return;
          deleteDraft(draft.id);
          tr.remove();
          this.toast('Draft discarded.', 'success');
        });
      }

      // Render published posts, with draft badge if one exists
      for (const post of posts) {
        const hasDraft = post.path in pathDraftMap;
        const tr = this.#renderPostRow(post, hasDraft);
        tbody.appendChild(tr);
        tr.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          this.onEdit(post.path);
        });
        tr.querySelector('.edit-btn').addEventListener('click', () => this.onEdit(post.path));
        tr.querySelector('.delete-btn').addEventListener('click', e => {
          e.stopPropagation();
          this.#confirmDelete(post, tr, pathDraftMap[post.path]);
        });
      }

    } catch (e) {
      const loadingEl = container.querySelector('#posts-loading');
      loadingEl.innerHTML = `<span style="color:var(--red)">Posts folder "${this.config.postsPath}" not found.</span>`;

      const suggestion = await this.#findContentSuggestion();
      const hint = document.createElement('p');
      hint.style.cssText = 'margin:8px 0 0; font-size:13px; color:var(--text-muted)';
      if (suggestion !== null) {
        hint.innerHTML = `Found content in <code>${suggestion}</code> — <button class="btn-inline" id="posts-fix-btn">open settings to update</button>`;
        loadingEl.appendChild(hint);
        hint.querySelector('#posts-fix-btn').addEventListener('click', () => this.onSetup?.());
      } else {
        hint.textContent = 'Check your posts folder setting in Setup.';
        hint.querySelector && loadingEl.appendChild(hint);
        loadingEl.appendChild(hint);
      }
    }
  }

  async #findContentSuggestion() {
    const candidates = ['_posts', 'posts', 'content/posts', 'src/posts', 'content', '_content', 'blog', ''];
    for (const path of candidates) {
      if (path === this.config.postsPath) continue;
      try {
        const files = await this.client.listDir(path);
        const found = files.some(f => f.type === 'file' && /\.(md|html?)$/i.test(f.name));
        if (found) return path === '' ? '(repo root)' : path;
      } catch { /* keep looking */ }
    }
    return null;
  }

  #renderDraftRow(draft) {
    const tr    = document.createElement('tr');
    const title = draft.fm?.title || 'Untitled draft';
    const t     = new Date(draft.savedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    tr.innerHTML = `
      <td class="post-date">${t}</td>
      <td>
        <div class="post-title" style="display:flex;align-items:center;gap:8px">
          ${escHtml(title)}
          <span class="draft-badge">Draft</span>
        </div>
      </td>
      <td>
        <div class="post-actions">
          <button class="btn btn-sm btn-ghost edit-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn">Discard</button>
        </div>
      </td>
    `;
    return tr;
  }

  #renderPostRow(post, hasDraft) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="post-date">${post.date}</td>
      <td>
        <div class="post-title" style="display:flex;align-items:center;gap:8px">
          ${escHtml(post.title)}
          ${hasDraft ? '<span class="draft-badge">Draft</span>' : ''}
        </div>
      </td>
      <td>
        <div class="post-actions">
          <button class="btn btn-sm btn-ghost edit-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn">Delete</button>
        </div>
      </td>
    `;
    return tr;
  }

  async #confirmDelete(post, tr, draftId) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      const file = await this.client.getFile(post.path);
      await this.client.deleteFile(post.path, file.sha, `Delete post: ${post.title}`);
      if (draftId) deleteDraft(draftId);
      tr.remove();
      this.toast('Post deleted.', 'success');
    } catch (e) {
      this.toast(`Delete failed: ${e.message}`, 'error');
    }
  }
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
