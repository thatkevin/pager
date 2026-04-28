import { parseFrontmatter, buildPostContent, filenameFromPost, dateToIso } from '../jekyll.js';
import { saveDraft, loadDraft, deleteDraft } from '../drafts.js';

const MARKED_URL    = 'https://esm.sh/marked@13';
const PURIFY_URL    = 'https://esm.sh/dompurify@3';
let markedPromise   = null;
let purifyPromise   = null;
const getMarked  = () => markedPromise  ??= import(MARKED_URL).then(m => m.marked);
const getPurify  = () => purifyPromise  ??= import(PURIFY_URL).then(m => m.default);

export class EditorView {
  constructor(client, config, { path, draftId = null, toast, onBack, onMediaPick }) {
    this.client      = client;
    this.config      = config;
    this.path        = path;
    this.draftId     = draftId ?? (path || `new-${Date.now()}`);
    this.toast       = toast;
    this.onBack      = onBack;
    this.onMediaPick = onMediaPick;
    this.sha         = null;
    this.fm          = {};
    this.body        = '';
    this.dirty       = false;
    this.tags        = [];
    this.#pollTimer  = null;
  }

  #pollTimer = null;

  render() {
    return `
      <div class="editor-view">
        <div class="editor-topbar">
          <div class="breadcrumb">
            <button class="btn btn-ghost btn-sm" id="back-btn">← Posts</button>
            <span id="filename-label" class="mono" style="color:var(--text-dim); font-size:11px"></span>
          </div>
          <div class="topbar-right">
            <span class="status" id="save-status"></span>
            <button class="btn btn-ghost btn-sm" id="draft-btn" disabled>Save draft</button>
            <button class="btn btn-primary" id="publish-btn" disabled>Publish ↑</button>
          </div>
        </div>

        <div class="editor-meta" id="editor-meta">
          <div class="loading-state" id="meta-loading" style="grid-column:1/-1">
            <div class="spinner"></div>
            <span>Loading…</span>
          </div>
        </div>

        <div class="editor-body" id="editor-body" data-pane="md">
          <div class="editor-textarea-wrap">
            <div class="editor-pane-label">
              Markdown
              <div class="pane-tabs-mobile">
                <button class="pane-tab active" data-pane="md">Write</button>
                <button class="pane-tab" data-pane="preview">Preview</button>
              </div>
            </div>
            <textarea class="editor-textarea" id="md-editor" placeholder="Start writing…" spellcheck="true"></textarea>
          </div>
          <div class="editor-preview-wrap">
            <div class="editor-pane-label">Preview</div>
            <div class="editor-preview" id="md-preview"></div>
          </div>
        </div>
      </div>
    `;
  }

  async bind(container) {
    container.querySelector('#back-btn').addEventListener('click', () => {
      if (this.dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
      clearTimeout(this.#pollTimer);
      this.onBack();
    });

    const body = container.querySelector('#editor-body');
    container.querySelectorAll('.pane-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const pane = tab.dataset.pane;
        body.dataset.pane = pane;
        container.querySelectorAll('.pane-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.pane === pane)
        );
      });
    });

    await this.#loadContent(container);
  }

  async #loadContent(container) {
    const meta       = container.querySelector('#editor-meta');
    const draftBtn   = container.querySelector('#draft-btn');
    const publishBtn = container.querySelector('#publish-btn');
    const status     = container.querySelector('#save-status');

    try {
      // Check localStorage for a draft of this post first
      const draft = loadDraft(this.draftId);

      if (draft) {
        // Restore draft — if it's an existing post we still need the SHA from GitHub
        if (this.path) {
          const file = await this.client.getFile(this.path);
          this.sha = file.sha;
        }
        this.fm   = draft.fm;
        this.body = draft.body;
        this.tags = Array.isArray(draft.fm.categories) ? [...draft.fm.categories] : [];
        const t   = new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        status.textContent = `Draft · saved ${t}`;
        container.querySelector('#filename-label').textContent =
          this.path ? this.path.split('/').pop() : (draft.fm.title ? filenameFromPost(draft.fm) : 'new post');

      } else if (this.path) {
        const file   = await this.client.getFile(this.path);
        const parsed = parseFrontmatter(file.content);
        this.sha  = file.sha;
        this.fm   = parsed.frontmatter;
        this.body = parsed.body;
        this.tags = Array.isArray(this.fm.categories) ? [...this.fm.categories] : [];
        container.querySelector('#filename-label').textContent = this.path.split('/').pop();

      } else {
        this.fm = {
          title: '', date: new Date().toISOString(), layout: 'post',
          categories: [], description: '', thumbnail: '', image: '',
        };
        this.tags = [];
        this.body = '';
        container.querySelector('#filename-label').textContent = 'new post';
      }

      meta.innerHTML = this.#metaFormHtml();
      this.#bindMeta(container);
      draftBtn.disabled   = false;
      publishBtn.disabled = false;

      const textarea = container.querySelector('#md-editor');
      textarea.value = this.body;
      this.#updatePreview(container, this.body);

      let previewTimer;
      textarea.addEventListener('input', () => {
        this.body  = textarea.value;
        this.dirty = true;
        this.#setStatus(container, 'Unsaved changes');
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => this.#updatePreview(container, this.body), 300);
      });

      textarea.addEventListener('paste', e => this.#handlePaste(e, textarea, container));

      draftBtn.addEventListener('click',   () => this.#saveDraft(container));
      publishBtn.addEventListener('click', () => this.#publish(container));

    } catch (e) {
      const el = container.querySelector('#meta-loading');
      el.innerHTML = '<span style="color:var(--red)"></span>';
      el.firstElementChild.textContent = `Failed to load: ${e.message}`;
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  #collectFm(container) {
    return {
      title:       container.querySelector('#fm-title')?.value       || this.fm.title,
      date:        container.querySelector('#fm-date')?.value        || this.fm.date,
      layout:      container.querySelector('#fm-layout')?.value      || this.fm.layout,
      categories:  this.tags,
      description: container.querySelector('#fm-desc')?.value       || this.fm.description,
      thumbnail:   container.querySelector('#fm-thumb')?.value      || this.fm.thumbnail,
      image:       container.querySelector('#fm-image')?.value      || this.fm.image,
    };
  }

  #setStatus(container, text, opts = false) {
    if (typeof opts === 'boolean') opts = { spinner: opts };
    const { spinner = false, href = null } = opts;
    const el = container.querySelector('#save-status');
    if (!el) return;
    let html = spinner ? '<div class="spinner"></div> ' : '';
    html += href
      ? `<a href="${href}" target="_blank" rel="noopener" class="status-link">${text}</a>`
      : text;
    el.innerHTML = html;
  }

  // ── Save draft ─────────────────────────────────────────────────────────────

  #saveDraft(container) {
    const fm = this.#collectFm(container);
    saveDraft(this.draftId, { fm, body: this.body, path: this.path });
    this.fm    = fm;
    this.dirty = false;
    const t    = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.#setStatus(container, `Draft · saved ${t}`);
    this.toast('Draft saved.', 'success');
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  async #publish(container) {
    const draftBtn   = container.querySelector('#draft-btn');
    const publishBtn = container.querySelector('#publish-btn');
    draftBtn.disabled   = true;
    publishBtn.disabled = true;
    this.#setStatus(container, 'Publishing…', true);

    try {
      const fm       = this.#collectFm(container);
      const content  = buildPostContent(fm, this.body);
      const filename = this.path ? this.path.split('/').pop() : filenameFromPost(fm);
      const filePath = this.path || `${this.config.postsPath}/${filename}`;
      const message  = this.path
        ? `Update post: ${fm.title || filename}`
        : `Add post: ${fm.title || filename}`;

      const res  = await this.client.writeFile(filePath, content, message, this.sha);
      this.sha   = res.content.sha;
      this.path  = filePath;
      this.fm    = fm;
      this.dirty = false;

      deleteDraft(this.draftId);
      container.querySelector('#filename-label').textContent = filename;
      this.toast('Published.', 'success');
      this.#monitorDeploy(container);

    } catch (e) {
      this.#setStatus(container, 'Publish failed');
      this.toast(`Publish failed: ${e.message}`, 'error');
      draftBtn.disabled   = false;
      publishBtn.disabled = false;
    }
  }

  // ── Paste image ────────────────────────────────────────────────────────────

  async #handlePaste(e, textarea, container) {
    const imageItem = Array.from(e.clipboardData?.items ?? [])
      .find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();

    const blob = imageItem.getAsFile();
    if (!blob) return;

    const ext  = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : 'jpg';
    const name = `paste-${Date.now()}.${ext}`;
    const path = `${this.config.mediaPath}/${name}`;

    // Insert placeholder at cursor so the user sees immediate feedback
    const start       = textarea.selectionStart;
    const end         = textarea.selectionEnd;
    const placeholder = `![uploading ${name}…]()`;
    textarea.value    = textarea.value.slice(0, start) + placeholder + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
    this.body  = textarea.value;
    this.dirty = true;

    this.#setStatus(container, 'Uploading image…', { spinner: true });

    try {
      const resized = await this.#resizeImage(blob);
      await this.client.uploadBinary(path, resized, `Upload pasted image: ${name}`);
      const md          = `![${name}](/${path})`;
      textarea.value    = textarea.value.replace(placeholder, md);
      this.body         = textarea.value;
      this.#updatePreview(container, this.body);
      this.#setStatus(container, 'Image uploaded');
      this.toast('Image uploaded.', 'success');
    } catch (err) {
      textarea.value = textarea.value.replace(placeholder, '');
      this.body      = textarea.value;
      this.#setStatus(container, 'Upload failed');
      this.toast(`Image upload failed: ${err.message}`, 'error');
    }
  }

  async #resizeImage(blob) {
    const maxWidth = this.config.maxImageWidth;
    if (!maxWidth || maxWidth <= 0) return blob;
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= maxWidth) { bitmap.close(); return blob; }
    const scale  = maxWidth / bitmap.width;
    const w      = Math.round(bitmap.width  * scale);
    const h      = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.convertToBlob({ type, quality: 0.85 });
  }

  // ── Actions monitor ────────────────────────────────────────────────────────

  async #monitorDeploy(container) {
    const publishBtn = container.querySelector('#publish-btn');
    const actionsUrl = `https://github.com/${this.config.owner}/${this.config.repo}/actions`;
    this.#setStatus(container, 'Deploying…', { spinner: true, href: actionsUrl });

    const started = Date.now();
    const TIMEOUT = 3 * 60_000;

    const poll = async () => {
      if (Date.now() - started > TIMEOUT) {
        this.#setStatus(container, 'Deploy timed out', { href: actionsUrl });
        publishBtn.disabled = false;
        return;
      }
      try {
        const run = await this.client.getLatestRun();
        if (!run || run.status !== 'completed') {
          this.#pollTimer = setTimeout(poll, 5000);
          return;
        }
        if (run.conclusion === 'success') {
          this.#setStatus(container, 'Live ✓', { href: actionsUrl });
        } else {
          this.#setStatus(container, `Deploy ${run.conclusion}`, { href: actionsUrl });
        }
      } catch {
        this.#pollTimer = setTimeout(poll, 5000);
        return;
      }
      publishBtn.disabled = false;
    };

    this.#pollTimer = setTimeout(poll, 4000);
  }

  // ── Meta form ──────────────────────────────────────────────────────────────

  #metaFormHtml() {
    const f      = this.fm;
    const date   = f.date ? dateToIso(f.date) : new Date().toISOString().slice(0, 10);
    const layout = f.layout || 'post';

    const layoutOpts = this.config.layouts
      .map(l => `<option value="${l}" ${l === layout ? 'selected' : ''}>${l}</option>`)
      .join('');

    const tagHtml = this.tags
      .map(t => `<span class="tag">${escHtml(t)}<button class="tag-remove" data-tag="${escHtml(t)}">×</button></span>`)
      .join('');

    return `
      <div class="editor-meta-top">
        <div class="field field-title">
          <label>Title</label>
          <input type="text" id="fm-title" value="${escHtml(f.title || '')}" placeholder="Post title">
        </div>
        <div class="field field-date">
          <label>Date</label>
          <input type="date" id="fm-date" value="${date}">
        </div>
        <div class="field field-layout">
          <label>Layout</label>
          <select id="fm-layout">${layoutOpts}</select>
        </div>
      </div>
      <div class="field">
        <label>Categories</label>
        <div class="tags-input-wrap" id="tags-wrap">
          ${tagHtml}
          <input class="tags-input" id="tags-input" placeholder="Add category…" spellcheck="false">
        </div>
      </div>
      <div class="field">
        <label>Description</label>
        <input type="text" id="fm-desc" value="${escHtml(f.description || '')}" placeholder="Short description">
      </div>
      <div class="field">
        <label>Thumbnail</label>
        <div class="field-with-browse">
          <input type="text" id="fm-thumb" value="${escHtml(f.thumbnail || '')}" placeholder="/assets/images/photo.jpg">
          <button class="btn btn-sm btn-ghost media-pick-btn" data-target="fm-thumb">Browse</button>
        </div>
      </div>
      <div class="field">
        <label>Image</label>
        <div class="field-with-browse">
          <input type="text" id="fm-image" value="${escHtml(f.image || '')}" placeholder="/assets/images/photo.jpg">
          <button class="btn btn-sm btn-ghost media-pick-btn" data-target="fm-image">Browse</button>
        </div>
      </div>
    `;
  }

  #bindMeta(container) {
    const watch = (id, key) => {
      const el = container.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('input', () => {
        this.fm[key] = el.value;
        this.dirty   = true;
        this.#setStatus(container, 'Unsaved changes');
        if (key === 'title') {
          container.querySelector('#filename-label').textContent =
            this.path ? this.path.split('/').pop() : filenameFromPost(this.fm);
        }
      });
    };

    watch('fm-title', 'title');
    watch('fm-date',  'date');
    watch('fm-layout','layout');
    watch('fm-desc',  'description');
    watch('fm-thumb', 'thumbnail');
    watch('fm-image', 'image');

    this.#bindTagsInput(container);

    container.querySelectorAll('.media-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        this.onMediaPick(path => {
          const input = container.querySelector(`#${targetId}`);
          input.value = `/${path}`;
          this.fm[targetId === 'fm-thumb' ? 'thumbnail' : 'image'] = `/${path}`;
          this.dirty = true;
          this.#setStatus(container, 'Unsaved changes');
        });
      });
    });
  }

  #bindTagsInput(container) {
    const wrap  = container.querySelector('#tags-wrap');
    const input = container.querySelector('#tags-input');

    const addTag = val => {
      const tag = val.trim();
      if (!tag || this.tags.includes(tag)) return;
      this.tags.push(tag);
      this.fm.categories = [...this.tags];
      this.dirty = true;
      this.#setStatus(container, 'Unsaved changes');
      const span = document.createElement('span');
      span.className = 'tag';
      span.innerHTML = `${escHtml(tag)}<button class="tag-remove" data-tag="${escHtml(tag)}">×</button>`;
      span.querySelector('.tag-remove').addEventListener('click', () => this.#removeTag(container, tag, span));
      wrap.insertBefore(span, input);
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(input.value);
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && this.tags.length) {
        this.#removeTag(container, this.tags.at(-1), wrap.querySelector('.tag:last-of-type'));
      }
    });

    input.addEventListener('blur', () => {
      if (input.value.trim()) { addTag(input.value); input.value = ''; }
    });

    wrap.addEventListener('click', () => input.focus());

    wrap.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () =>
        this.#removeTag(container, btn.dataset.tag, btn.closest('.tag'))
      );
    });
  }

  #removeTag(container, tag, span) {
    this.tags = this.tags.filter(t => t !== tag);
    this.fm.categories = [...this.tags];
    this.dirty = true;
    this.#setStatus(container, 'Unsaved changes');
    span?.remove();
  }

  async #updatePreview(container, markdown) {
    try {
      const preview = container.querySelector('#md-preview');
      if (!preview) return;
      const [marked, DOMPurify] = await Promise.all([getMarked(), getPurify()]);
      preview.innerHTML = DOMPurify.sanitize(marked.parse(markdown));
    } catch { /* ignore */ }
  }
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
