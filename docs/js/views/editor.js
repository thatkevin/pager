import { parseFrontmatter, buildPostContent, filenameFromPost, filenameFromPage, dateToIso } from '../jekyll.js';
import { saveDraft, loadDraft, deleteDraft } from '../drafts.js';

const MARKED_URL   = '../vendor/marked.js';
const PURIFY_URL   = '../vendor/dompurify.js';
let markedPromise  = null;
let purifyPromise  = null;
const getMarked = () => markedPromise  ??= import(MARKED_URL).then(m => m.marked);
const getPurify = () => purifyPromise  ??= import(PURIFY_URL).then(m => m.default);

const OPT_SIZES = [480, 720, 1200];

export class EditorView {
  constructor(client, config, { path, draftId = null, toast, onBack, onMediaPick, fileType = null, isPage = false }) {
    this.client      = client;
    this.config      = config;
    this.path        = path;
    this.fileType    = fileType;
    this.isPage      = isPage || fileType === 'html' || (path && /\.html?$/i.test(path));
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
  // Blob URLs for images pasted/uploaded this session — used for immediate preview
  #blobUrls  = new Map();
  #textarea  = null;

  get #isHtmlFile() {
    return this.fileType === 'html' || (!!this.path && /\.html?$/i.test(this.path));
  }

  render() {
    const label       = this.#isHtmlFile ? 'HTML' : 'Markdown';
    const previewPane = this.#isHtmlFile
      ? `<iframe class="html-preview-frame" id="html-preview-frame"
                 sandbox="allow-same-origin" title="Page preview"></iframe>`
      : `<div class="editor-preview" id="md-preview"></div>`;
    const previewLabel = this.#isHtmlFile
      ? `Preview <span class="preview-note">(scripts stripped · Liquid not processed)</span>`
      : 'Preview';
    const backLabel = this.isPage ? '← Pages' : '← Posts';

    return `
      <div class="editor-view">
        <div class="editor-topbar">
          <div class="breadcrumb">
            <button class="btn btn-ghost btn-sm" id="back-btn">${backLabel}</button>
            <span id="filename-label" class="mono" style="color:var(--text-dim); font-size:11px"></span>
          </div>
          <div class="topbar-right">
            <span class="status" id="save-status"></span>
            ${!this.#isHtmlFile ? `<button class="btn btn-ghost btn-sm" id="optimise-btn" disabled title="Upload responsive image variants for every image in this post">Optimise images</button>` : ''}
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
              ${label}
              <div class="pane-tabs-mobile">
                <button class="pane-tab active" data-pane="md">Write</button>
                <button class="pane-tab" data-pane="preview">Preview</button>
              </div>
            </div>
            <textarea class="editor-textarea" id="md-editor"
                      placeholder="Start writing…"
                      spellcheck="${this.#isHtmlFile ? 'false' : 'true'}"></textarea>
          </div>
          <div class="editor-preview-wrap">
            <div class="editor-pane-label">${previewLabel}</div>
            ${previewPane}
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
      const draft = loadDraft(this.draftId);

      if (draft) {
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
          this.path ? this.path.split('/').pop()
            : (draft.fm.title
                ? (this.#isHtmlFile ? filenameFromPage(draft.fm, 'html') : filenameFromPost(draft.fm))
                : (this.#isHtmlFile ? 'new page' : 'new post'));

      } else if (this.path) {
        const file   = await this.client.getFile(this.path);
        const parsed = parseFrontmatter(file.content);
        this.sha  = file.sha;
        this.fm   = parsed.frontmatter;
        this.body = parsed.body;
        this.tags = Array.isArray(this.fm.categories) ? [...this.fm.categories] : [];
        container.querySelector('#filename-label').textContent = this.path.split('/').pop();

      } else if (this.#isHtmlFile) {
        this.fm   = { title: '', layout: 'page', description: '', permalink: '' };
        this.body = '---\n<!-- page content here -->\n';
        container.querySelector('#filename-label').textContent = 'new page';
      } else {
        this.fm   = { title: '', date: new Date().toISOString(), layout: 'post',
                      categories: [], description: '', thumbnail: '', image: '' };
        this.tags = [];
        this.body = '';
        container.querySelector('#filename-label').textContent = this.isPage ? 'new page' : 'new post';
      }

      meta.innerHTML = this.#metaFormHtml();
      this.#bindMeta(container);
      draftBtn.disabled   = false;
      publishBtn.disabled = false;

      const textarea = container.querySelector('#md-editor');
      this.#textarea = textarea;
      textarea.value = this.body;
      this.#refreshPreview(container, this.body);

      const optimiseBtn = container.querySelector('#optimise-btn');
      if (optimiseBtn) {
        optimiseBtn.disabled = false;
        optimiseBtn.addEventListener('click', () => this.#optimiseImages(container));
      }

      let previewTimer;
      textarea.addEventListener('input', () => {
        this.body  = textarea.value;
        this.dirty = true;
        this.#setStatus(container, 'Unsaved changes');
        clearTimeout(previewTimer);
        if (this.#isHtmlFile) {
          this.#updateHtmlPreview(container, this.body);
        } else {
          previewTimer = setTimeout(() => this.#updatePreview(container, this.body), 300);
        }
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

  #refreshPreview(container, content) {
    if (this.#isHtmlFile) {
      this.#updateHtmlPreview(container, content);
    } else {
      this.#updatePreview(container, content);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  #collectFm(container) {
    if (this.#isHtmlFile || this.isPage) {
      return {
        title:       container.querySelector('#fm-title')?.value       || this.fm.title,
        layout:      container.querySelector('#fm-layout')?.value      || this.fm.layout,
        description: container.querySelector('#fm-desc')?.value        || this.fm.description,
        permalink:   container.querySelector('#fm-permalink')?.value   || this.fm.permalink || undefined,
      };
    }
    return {
      title:       container.querySelector('#fm-title')?.value        || this.fm.title,
      date:        container.querySelector('#fm-date')?.value         || this.fm.date,
      layout:      container.querySelector('#fm-layout')?.value       || this.fm.layout,
      categories:  this.tags,
      description: container.querySelector('#fm-desc')?.value         || this.fm.description,
      thumbnail:   container.querySelector('#fm-thumb')?.value        || this.fm.thumbnail,
      image:       container.querySelector('#fm-image')?.value        || this.fm.image,
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
      const fm = this.#collectFm(container);

      let filename, filePath;
      if (this.path) {
        filename = this.path.split('/').pop();
        filePath = this.path;
      } else if (this.#isHtmlFile) {
        filename = filenameFromPage(fm, 'html');
        const base = this.config.pagesPath || '';
        filePath = base ? `${base}/${filename}` : filename;
      } else if (this.isPage) {
        filename = filenameFromPage(fm, 'md');
        const base = this.config.pagesPath || '';
        filePath = base ? `${base}/${filename}` : filename;
      } else {
        filename = filenameFromPost(fm);
        filePath = `${this.config.postsPath}/${filename}`;
      }

      const kind    = this.isPage || this.#isHtmlFile ? 'page' : 'post';
      const message = this.path
        ? `Update ${kind}: ${fm.title || filename}`
        : `Add ${kind}: ${fm.title || filename}`;

      const content = buildPostContent(fm, this.body);
      const res     = await this.client.writeFile(filePath, content, message, this.sha);
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

  // ── Paste image / URL ──────────────────────────────────────────────────────

  async #handlePaste(e, textarea, container) {
    // URL paste — wrap selected text as markdown link (markdown only)
    if (!this.#isHtmlFile) {
      const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (/^https?:\/\/\S+$/.test(text)) {
        const start    = textarea.selectionStart;
        const end      = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end);
        e.preventDefault();
        const insertion = selected ? `[${selected}](${text})` : `[](${text})`;
        textarea.value  = textarea.value.slice(0, start) + insertion + textarea.value.slice(end);
        const cursor = selected ? start + insertion.length : start + 1;
        textarea.selectionStart = textarea.selectionEnd = cursor;
        this.body  = textarea.value;
        this.dirty = true;
        this.#setStatus(container, 'Unsaved changes');
        this.#updatePreview(container, this.body);
        return;
      }
    }

    const imageItem = Array.from(e.clipboardData?.items ?? [])
      .find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();

    const blob = imageItem.getAsFile();
    if (!blob) return;

    const ext  = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : 'jpg';
    const name = `paste-${Date.now()}.${ext}`;
    const path = `${this.config.mediaPath}/${name}`;

    const start       = textarea.selectionStart;
    const end         = textarea.selectionEnd;
    const placeholder = this.#isHtmlFile
      ? `<img src="" alt="${name} (uploading…)">`
      : `![uploading ${name}…]()`;
    textarea.value    = textarea.value.slice(0, start) + placeholder + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
    this.body  = textarea.value;
    this.dirty = true;

    this.#setStatus(container, 'Uploading image…', { spinner: true });

    try {
      const resized = await this.#resizeImage(blob);
      await this.client.uploadBinary(path, resized, `Upload pasted image: ${name}`);

      // Store a blob URL so the preview can show the image immediately without
      // waiting for GitHub's CDN to propagate the upload
      const objectUrl = URL.createObjectURL(resized);
      this.#blobUrls.set(`/${path}`, objectUrl);

      const insertion = this.#isHtmlFile
        ? `<img src="/${path}" alt="${name}">`
        : `![${name}](/${path})`;
      textarea.value = textarea.value.replace(placeholder, insertion);
      this.body      = textarea.value;
      this.#refreshPreview(container, this.body);
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

  // ── Optimise images ────────────────────────────────────────────────────────

  async #optimiseImages(container) {
    const optimiseBtn = container.querySelector('#optimise-btn');
    const draftBtn    = container.querySelector('#draft-btn');
    const publishBtn  = container.querySelector('#publish-btn');

    optimiseBtn.disabled = true;
    draftBtn.disabled    = true;
    publishBtn.disabled  = true;
    this.#setStatus(container, 'Optimising images…', { spinner: true });

    // Match standard markdown images with absolute paths only
    const imgRe = /!\[([^\]]*)\]\((\/[^)\s]+\.(?:jpe?g|png|webp))\)/gi;
    const matches = [...this.body.matchAll(imgRe)]
      .filter(([, , src]) => !/-\d+w\.(?:jpe?g|png|gif|webp)$/i.test(src));

    if (!matches.length) {
      this.toast('No images to optimise — all images may already be small or use responsive variants.', 'info');
      this.#setStatus(container, '');
      optimiseBtn.disabled = false;
      draftBtn.disabled    = false;
      publishBtn.disabled  = false;
      return;
    }

    let content = this.body;
    let count   = 0;
    const seen  = new Set();

    for (const [full, alt, src] of matches) {
      if (seen.has(src)) continue;
      seen.add(src);

      const filePath = src.replace(/^\//, '');
      const rawUrl   = `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}/${filePath}`;

      try {
        this.#setStatus(container, `Fetching ${filePath.split('/').pop()}…`, { spinner: true });
        const resp = await fetch(rawUrl);
        if (!resp.ok) { this.toast(`Could not fetch ${src}`, 'error'); continue; }
        const blob = await resp.blob();

        const probe  = await createImageBitmap(blob);
        const origW  = probe.width;
        probe.close();

        if (origW <= OPT_SIZES[0]) {
          this.toast(`${src.split('/').pop()} is already ${origW}px wide — skipping.`, 'info');
          continue;
        }

        // Build list of widths to generate (only smaller than original)
        const sizes = OPT_SIZES.filter(w => w < origW);
        // Cap at original if original is smaller than the largest breakpoint
        sizes.push(Math.min(origW, OPT_SIZES[OPT_SIZES.length - 1]));
        const uniqueSizes = [...new Set(sizes)].sort((a, b) => a - b);

        const basePath = filePath.replace(/\.[^.]+$/, '');
        const ext      = blob.type === 'image/png' ? 'png' : 'jpg';
        const mimeType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const srcsetParts = [];

        for (const w of uniqueSizes) {
          const bm     = await createImageBitmap(blob);
          const h      = Math.round(bm.height * (w / bm.width));
          const canvas = new OffscreenCanvas(w, h);
          canvas.getContext('2d').drawImage(bm, 0, 0, w, h);
          bm.close();
          const resized     = await canvas.convertToBlob({ type: mimeType, quality: 0.85 });
          const resizedPath = `${basePath}-${w}w.${ext}`;

          // Fetch existing SHA so we can update rather than fail on duplicate
          let sha = null;
          try { sha = (await this.client.getFile(resizedPath)).sha; } catch {}
          await this.client.uploadBinary(resizedPath, resized, `Optimise: ${w}w variant of ${filePath.split('/').pop()}`, sha);

          // Store blob URL for immediate preview
          const objectUrl = URL.createObjectURL(resized);
          this.#blobUrls.set(`/${resizedPath}`, objectUrl);
          srcsetParts.push({ w, path: `/${resizedPath}` });
        }

        const srcset    = srcsetParts.map(({ w, path }) => `${path} ${w}w`).join(', ');
        const largestSrc = srcsetParts.at(-1).path;
        const picture   = [
          '<picture>',
          `  <source srcset="${srcset}" sizes="100vw">`,
          `  <img src="${largestSrc}" alt="${alt}">`,
          '</picture>',
        ].join('\n');

        content = content.split(full).join(picture);
        count++;
      } catch (e) {
        this.toast(`Skipped ${src.split('/').pop()}: ${e.message}`, 'error');
      }
    }

    if (count > 0) {
      this.body          = content;
      this.#textarea.value = content;
      this.dirty         = true;
      this.#refreshPreview(container, content);
      this.#setStatus(container, `${count} image${count !== 1 ? 's' : ''} optimised`);
      this.toast(`Optimised ${count} image${count !== 1 ? 's' : ''}. Review then publish.`, 'success');
    } else {
      this.#setStatus(container, '');
    }

    optimiseBtn.disabled = false;
    draftBtn.disabled    = false;
    publishBtn.disabled  = false;
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
    return (this.#isHtmlFile || this.isPage) ? this.#pageMetaHtml() : this.#postMetaHtml();
  }

  #pageMetaHtml() {
    const f      = this.fm;
    const layout = f.layout || 'page';
    const layouts = this.config.layouts ?? ['post', 'page', 'default'];
    const layoutOpts = layouts
      .map(l => `<option value="${l}" ${l === layout ? 'selected' : ''}>${l}</option>`)
      .join('');
    return `
      <div class="editor-meta-top">
        <div class="field field-title">
          <label>Title</label>
          <input type="text" id="fm-title" value="${escHtml(f.title || '')}" placeholder="Page title">
        </div>
        <div class="field field-layout">
          <label>Layout</label>
          <select id="fm-layout">${layoutOpts}</select>
        </div>
        <div class="field">
          <label>Permalink</label>
          <input type="text" id="fm-permalink" value="${escHtml(f.permalink || '')}" placeholder="/about/">
        </div>
      </div>
      <div class="field">
        <label>Description</label>
        <input type="text" id="fm-desc" value="${escHtml(f.description || '')}" placeholder="Short description">
      </div>
    `;
  }

  #postMetaHtml() {
    const f      = this.fm;
    const date   = f.date ? dateToIso(f.date) : new Date().toISOString().slice(0, 10);
    const layout = f.layout || 'post';
    const layouts = this.config.layouts ?? ['post', 'page', 'default'];

    const layoutOpts = layouts
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
          const name = this.path ? this.path.split('/').pop()
            : this.#isHtmlFile ? filenameFromPage(this.fm, 'html')
            : this.isPage      ? filenameFromPage(this.fm, 'md')
            : filenameFromPost(this.fm);
          container.querySelector('#filename-label').textContent = name;
        }
      });
    };

    if (this.#isHtmlFile || this.isPage) {
      watch('fm-title',     'title');
      watch('fm-layout',    'layout');
      watch('fm-desc',      'description');
      watch('fm-permalink', 'permalink');
    } else {
      watch('fm-title',  'title');
      watch('fm-date',   'date');
      watch('fm-layout', 'layout');
      watch('fm-desc',   'description');
      watch('fm-thumb',  'thumbnail');
      watch('fm-image',  'image');
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
  }

  #bindTagsInput(container) {
    const wrap  = container.querySelector('#tags-wrap');
    const input = container.querySelector('#tags-input');
    if (!wrap || !input) return;

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

  // ── Markdown preview ────────────────────────────────────────────────────────

  async #updatePreview(container, markdown) {
    try {
      const preview = container.querySelector('#md-preview');
      if (!preview) return;
      const [marked, DOMPurify] = await Promise.all([getMarked(), getPurify()]);
      const html = DOMPurify.sanitize(marked.parse(markdown));
      const base = `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}`;
      preview.innerHTML = html.replace(
        /(<img\b[^>]*?\ssrc=)(["'])(\/.+?)\2/gi,
        (_, tag, q, path) => {
          // Use local blob URL if available (e.g. freshly pasted/optimised image not yet on CDN)
          const blobUrl = this.#blobUrls.get(path);
          return blobUrl
            ? `${tag}${q}${blobUrl}${q}`
            : `${tag}${q}${base}${path}${q}`;
        },
      );
    } catch { /* ignore */ }
  }

  // ── HTML preview ────────────────────────────────────────────────────────────

  #updateHtmlPreview(container, html) {
    const frame = container.querySelector('#html-preview-frame');
    if (!frame) return;
    const rawBase = `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}`;
    frame.srcdoc  = buildSafeHtmlPreview(html, rawBase);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSafeHtmlPreview(content, rawBase) {
  let html = content
    // Strip Liquid control tags {% %}
    .replace(/\{%-?[\s\S]*?-?%\}/g, '')
    // Replace Liquid output {{ }} with a dim placeholder
    .replace(/\{\{-?[\s\S]*?-?\}\}/g, '<span style="opacity:.35;font-style:italic">[dynamic]</span>')
    // Remove script elements entirely
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    // Remove inline event handlers
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');

  // Rewrite root-relative src/href/action to the raw GitHub URL
  html = html.replace(
    /(\b(?:src|href|action)\s*=\s*["'])(\/[^"'#\s][^"']*)(["'])/gi,
    (_, attr, path, q) => `${attr}${rawBase}${path}${q}`,
  );

  // Inject a <base> tag so any remaining relative paths resolve correctly
  const baseTag = `<base href="${rawBase}/">`;
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, m => `${m}\n  ${baseTag}`);
  } else {
    html = `<head>${baseTag}</head>\n` + html;
  }

  return html;
}
