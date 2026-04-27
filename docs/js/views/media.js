export class MediaView {
  constructor(client, config, { toast, pickMode = false, onPick }) {
    this.client   = client;
    this.config   = config;
    this.toast    = toast;
    this.pickMode = pickMode;
    this.onPick   = onPick;
    this.items    = [];
  }

  render() {
    return `
      <div class="media-view">
        <div class="page-header">
          <h1>${this.pickMode ? 'Pick an image' : 'Media'}</h1>
          ${this.pickMode ? '<button class="btn btn-ghost btn-sm" id="cancel-pick">Cancel</button>' : ''}
        </div>

        <div class="media-upload-zone" id="drop-zone">
          <div class="upload-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
          </div>
          <p>Drop images here to upload</p>
          <small>JPEG, PNG, WebP, GIF. Resized before upload.</small>
          <input type="file" id="file-input" multiple accept="image/*" style="display:none">
        </div>

        <div class="media-grid-wrap">
          <div class="loading-state" id="media-loading">
            <div class="spinner"></div>
            <span>Loading media…</span>
          </div>
          <div class="media-grid" id="media-grid" style="display:none"></div>
          <div class="empty-state" id="media-empty" style="display:none">
            <p>No images yet. Upload something.</p>
          </div>
        </div>
      </div>
    `;
  }

  async bind(container) {
    if (this.pickMode) {
      container.querySelector('#cancel-pick')?.addEventListener('click', () => this.onPick(null));
    }

    this.#bindUpload(container);
    await this.#loadMedia(container);
  }

  #bindUpload(container) {
    const zone   = container.querySelector('#drop-zone');
    const input  = container.querySelector('#file-input');

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
      if (files.length) this.#uploadFiles(container, files);
    });

    input.addEventListener('change', () => {
      const files = [...input.files];
      if (files.length) this.#uploadFiles(container, files);
      input.value = '';
    });
  }

  async #uploadFiles(container, files) {
    this.#showUploadModal(container, files);
  }

  #showUploadModal(container, files) {
    const file = files[0];
    const remaining = files.slice(1);

    const preview = URL.createObjectURL(file);
    const defaultName = sanitizeFilename(file.name);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Upload image</h2>
          <button class="btn btn-ghost btn-sm" id="modal-close">✕</button>
        </div>
        <img class="modal-preview" src="${preview}" alt="">
        <div class="modal-fields">
          <div class="field">
            <label>Filename</label>
            <input type="text" id="upload-name" value="${defaultName}">
          </div>
          <div class="field">
            <label>Max width</label>
            <div class="resize-options">
              ${[800, 1200, 1400, 1920, 0].map(w =>
                `<button class="resize-opt ${w === 1400 ? 'active' : ''}" data-w="${w}">${w === 0 ? 'Original' : `${w}px`}</button>`
              ).join('')}
            </div>
          </div>
          <div class="field">
            <label>Quality: <span id="quality-label">85%</span></label>
            <input type="range" id="quality-range" min="50" max="100" value="85" step="5">
          </div>
          <div class="progress-bar" id="upload-progress" style="display:none">
            <div class="progress-fill" id="progress-fill" style="width:0%"></div>
          </div>
          <div id="upload-error" class="login-error" style="display:none"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="upload-confirm">Upload${files.length > 1 ? ` (1 of ${files.length})` : ''}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let maxWidth = 1400;

    modal.querySelectorAll('.resize-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.resize-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        maxWidth = parseInt(btn.dataset.w, 10);
      });
    });

    const qualityRange = modal.querySelector('#quality-range');
    const qualityLabel = modal.querySelector('#quality-label');
    qualityRange.addEventListener('input', () => {
      qualityLabel.textContent = `${qualityRange.value}%`;
    });

    modal.querySelector('#modal-close').addEventListener('click', close);
    modal.querySelector('#modal-cancel').addEventListener('click', close);

    modal.querySelector('#upload-confirm').addEventListener('click', async () => {
      const name    = modal.querySelector('#upload-name').value.trim();
      const quality = parseInt(qualityRange.value, 10) / 100;
      const errEl   = modal.querySelector('#upload-error');
      const prog    = modal.querySelector('#upload-progress');
      const fill    = modal.querySelector('#progress-fill');
      const btn     = modal.querySelector('#upload-confirm');

      if (!name) return;

      btn.disabled  = true;
      errEl.style.display = 'none';
      prog.style.display  = 'block';
      fill.style.width    = '20%';

      try {
        const blob     = maxWidth > 0 ? await resizeImage(file, maxWidth, quality) : file;
        fill.style.width = '60%';
        const path     = `${this.config.mediaPath}/${name}`;
        await this.client.uploadBinary(path, blob, `Upload media: ${name}`);
        fill.style.width = '100%';
        this.toast(`Uploaded ${name}`, 'success');
        close();
        URL.revokeObjectURL(preview);
        await this.#loadMedia(container);

        if (remaining.length) {
          setTimeout(() => this.#showUploadModal(container, remaining), 200);
        }
      } catch (e) {
        errEl.textContent   = `Upload failed: ${e.message}`;
        errEl.style.display = 'block';
        prog.style.display  = 'none';
        btn.disabled = false;
      }
    });

    function close() {
      URL.revokeObjectURL(preview);
      modal.remove();
    }

    modal.querySelector('#upload-name').focus();
  }

  async #loadMedia(container) {
    const loading = container.querySelector('#media-loading');
    const grid    = container.querySelector('#media-grid');
    const empty   = container.querySelector('#media-empty');

    loading.style.display = 'flex';
    grid.style.display    = 'none';
    empty.style.display   = 'none';
    grid.innerHTML        = '';

    try {
      const items = await this.client.listDir(this.config.mediaPath);
      this.items = items.filter(i => i.type === 'file' && /\.(jpe?g|png|gif|webp|svg)$/i.test(i.name));

      loading.style.display = 'none';

      if (!this.items.length) {
        empty.style.display = 'flex';
        return;
      }

      grid.style.display = 'grid';

      for (const item of this.items) {
        const el = this.#renderItem(item);
        grid.appendChild(el);
      }
    } catch (e) {
      loading.innerHTML = '<span style="color:var(--red)"></span>';
      loading.firstElementChild.textContent = `Failed to load media: ${e.message}`;
    }
  }

  #renderItem(item) {
    const rawUrl = this.client.rawUrl(item.path);
    const div    = document.createElement('div');
    div.className = 'media-item';

    const assetPath = `/${item.path}`;

    div.innerHTML = `
      <img class="media-thumb" src="${rawUrl}" alt="${item.name}" loading="lazy">
      <div class="media-item-info">
        <div class="media-item-name" title="${item.name}">${item.name}</div>
      </div>
      <div class="media-item-overlay">
        <button class="btn btn-sm btn-primary copy-btn">Copy path</button>
        ${!this.pickMode ? `<button class="btn btn-sm btn-danger delete-btn">Delete</button>` : ''}
      </div>
    `;

    div.querySelector('.copy-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (this.pickMode) {
        this.onPick(item.path);
      } else {
        navigator.clipboard.writeText(assetPath);
        this.toast('Path copied.', 'success');
      }
    });

    if (!this.pickMode) {
      div.querySelector('.delete-btn').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete ${item.name}?`)) return;
        try {
          await this.client.deleteFile(item.path, item.sha, `Delete media: ${item.name}`);
          div.remove();
          this.toast('Deleted.', 'success');
        } catch (err) {
          this.toast(`Delete failed: ${err.message}`, 'error');
        }
      });
    }

    if (this.pickMode) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => this.onPick(item.path));
    }

    return div;
  }
}

async function resizeImage(file, maxWidth, quality) {
  const bitmap = await createImageBitmap(file);
  const scale  = maxWidth > 0 ? Math.min(1, maxWidth / bitmap.width) : 1;
  const w      = Math.round(bitmap.width  * scale);
  const h      = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.convertToBlob({ type, quality });
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}
