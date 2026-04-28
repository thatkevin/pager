const VARIANT_RE = /^(.+)-(\d+)w\.\w+$/;

export class MediaView {
  constructor(client, config, { toast, pickMode = false, onPick }) {
    this.client   = client;
    this.config   = config;
    this.toast    = toast;
    this.pickMode = pickMode;
    this.onPick   = onPick;
    this.items    = [];   // flat list
    this.groups   = [];   // grouped for display
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
          <small>JPEG, PNG, WebP, GIF.${this.config.maxImageWidth ? ` Default max width: ${this.config.maxImageWidth}px.` : ''}</small>
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
    const zone  = container.querySelector('#drop-zone');
    const input = container.querySelector('#file-input');

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
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
    const file      = files[0];
    const remaining = files.slice(1);
    const preview   = URL.createObjectURL(file);
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
                `<button class="resize-opt ${w === (this.config.maxImageWidth ?? 1400) ? 'active' : ''}" data-w="${w}">${w === 0 ? 'Original' : `${w}px`}</button>`
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

    let maxWidth = this.config.maxImageWidth ?? 1400;

    modal.querySelectorAll('.resize-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.resize-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        maxWidth = parseInt(btn.dataset.w, 10);
      });
    });

    const qualityRange = modal.querySelector('#quality-range');
    const qualityLabel = modal.querySelector('#quality-label');
    qualityRange.addEventListener('input', () => { qualityLabel.textContent = `${qualityRange.value}%`; });

    const close = () => { URL.revokeObjectURL(preview); modal.remove(); };

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

      btn.disabled = true;
      errEl.style.display = 'none';
      prog.style.display  = 'block';
      fill.style.width    = '20%';

      try {
        const blob = maxWidth > 0 ? await resizeImage(file, maxWidth, quality) : file;
        fill.style.width = '60%';
        const path = `${this.config.mediaPath}/${name}`;
        await this.client.uploadBinary(path, blob, `Upload media: ${name}`);
        fill.style.width = '100%';
        this.toast(`Uploaded ${name}`, 'success');
        close();
        await this.#loadMedia(container);
        if (remaining.length) setTimeout(() => this.#showUploadModal(container, remaining), 200);
      } catch (e) {
        errEl.textContent   = `Upload failed: ${e.message}`;
        errEl.style.display = 'block';
        prog.style.display  = 'none';
        btn.disabled = false;
      }
    });

    modal.querySelector('#upload-name').focus();
  }

  // ── Load & group ────────────────────────────────────────────────────────────

  async #loadMedia(container) {
    const loading = container.querySelector('#media-loading');
    const grid    = container.querySelector('#media-grid');
    const empty   = container.querySelector('#media-empty');

    loading.style.display = 'flex';
    grid.style.display    = 'none';
    empty.style.display   = 'none';
    grid.innerHTML        = '';

    try {
      const items  = await this.client.listDir(this.config.mediaPath);
      this.items   = items.filter(i => i.type === 'file' && /\.(jpe?g|png|gif|webp|svg)$/i.test(i.name));
      this.groups  = groupItems(this.items);
      loading.style.display = 'none';

      if (!this.groups.length) { empty.style.display = 'flex'; return; }

      grid.style.display = 'grid';
      for (const group of this.groups) {
        grid.appendChild(this.#renderGroup(group, container));
      }
    } catch (e) {
      loading.innerHTML = '<span style="color:var(--red)"></span>';
      loading.firstElementChild.textContent = `Failed to load media: ${e.message}`;
    }
  }

  // ── Render group card ───────────────────────────────────────────────────────

  #renderGroup({ primary, variants }, container) {
    const rawUrl    = this.client.rawUrl(primary.path);
    const assetPath = `/${primary.path}`;
    const allFiles  = [primary, ...variants];
    const hasVars   = variants.length > 0;

    const div = document.createElement('div');
    div.className = 'media-item';

    div.innerHTML = `
      <img class="media-thumb" src="${rawUrl}" alt="${primary.name}" loading="lazy">
      ${hasVars ? `<span class="variant-badge">${allFiles.length} sizes</span>` : ''}
      <div class="media-item-info">
        <div class="media-item-name" title="${primary.name}">${primary.name}</div>
        ${hasVars ? `
          <div class="variant-chips">
            ${allFiles.map(f => `<span class="variant-chip">${chipLabel(f)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="media-item-overlay">
        <button class="btn btn-sm btn-primary copy-btn">${this.pickMode ? 'Select' : 'Copy path'}</button>
        ${!this.pickMode ? `
          <button class="btn btn-sm btn-ghost rename-btn">Rename</button>
          <button class="btn btn-sm btn-danger delete-btn">Delete${hasVars ? ` +${variants.length}` : ''}</button>
        ` : ''}
      </div>
    `;

    div.querySelector('.copy-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (this.pickMode) {
        this.onPick(primary.path);
      } else {
        navigator.clipboard.writeText(assetPath);
        this.toast('Path copied.', 'success');
      }
    });

    if (!this.pickMode) {
      div.querySelector('.rename-btn').addEventListener('click', e => {
        e.stopPropagation();
        this.#showRenameModal(container, primary, variants);
      });

      div.querySelector('.delete-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const total = allFiles.length;
        const msg   = total > 1
          ? `Delete ${primary.name} and ${variants.length} variant file${variants.length > 1 ? 's' : ''}?`
          : `Delete ${primary.name}?`;
        if (!confirm(msg)) return;
        try {
          for (const f of allFiles) {
            await this.client.deleteFile(f.path, f.sha, `Delete media: ${f.name}`);
          }
          div.remove();
          this.toast(`Deleted ${total} file${total > 1 ? 's' : ''}.`, 'success');
        } catch (err) {
          this.toast(`Delete failed: ${err.message}`, 'error');
        }
      });
    }

    if (this.pickMode) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => this.onPick(primary.path));
    }

    return div;
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  #showRenameModal(container, primary, variants) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <h2>Rename</h2>
          <button class="btn btn-ghost btn-sm" id="modal-close">✕</button>
        </div>
        <div class="modal-fields">
          <div class="field">
            <label>New filename</label>
            <input type="text" id="rename-input" value="${primary.name}" spellcheck="false" autocomplete="off">
          </div>
          ${variants.length ? `<p style="font-size:11px;color:var(--text-muted);margin:0">${variants.length} variant file${variants.length > 1 ? 's' : ''} will be renamed automatically.</p>` : ''}
          <div class="rename-progress" id="rename-progress" style="display:none">
            <div class="spinner"></div>
            <span id="rename-status">Renaming…</span>
          </div>
          <div id="rename-error" class="login-error" style="display:none"></div>
        </div>
        <div class="modal-footer" id="rename-footer">
          <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="rename-confirm">Rename</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const input      = modal.querySelector('#rename-input');
    const confirmBtn = modal.querySelector('#rename-confirm');
    const cancelBtn  = modal.querySelector('#modal-cancel');
    const closeBtn   = modal.querySelector('#modal-close');
    const progressEl = modal.querySelector('#rename-progress');
    const statusEl   = modal.querySelector('#rename-status');
    const errorEl    = modal.querySelector('#rename-error');
    const footer     = modal.querySelector('#rename-footer');

    // Select filename stem for easy editing
    const dotIdx = primary.name.lastIndexOf('.');
    if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
    input.focus();

    const close = () => modal.remove();
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    const doRename = async () => {
      const newName = sanitizeFilename(input.value.trim());
      if (!newName || newName === primary.name) { close(); return; }

      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      closeBtn.disabled   = true;
      errorEl.style.display   = 'none';
      progressEl.style.display = 'flex';
      footer.style.display     = 'none';

      try {
        const setStatus = text => { statusEl.textContent = text; };
        const updated = await this.#doRename(primary, variants, newName, setStatus);
        close();
        const postNote = updated > 0 ? ` Updated ${updated} post${updated > 1 ? 's' : ''}.` : '';
        this.toast(`Renamed to ${newName}.${postNote}`, 'success');
        await this.#loadMedia(container);
      } catch (e) {
        errorEl.textContent      = e.message;
        errorEl.style.display    = 'block';
        progressEl.style.display = 'none';
        footer.style.display     = 'flex';
        confirmBtn.disabled = false;
        cancelBtn.disabled  = false;
        closeBtn.disabled   = false;
      }
    };

    confirmBtn.addEventListener('click', doRename);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); });
  }

  async #doRename(primary, variants, newName, setStatus) {
    const dir        = primary.path.substring(0, primary.path.lastIndexOf('/'));
    const oldBase    = primary.name.replace(/\.[^.]+$/, '');
    const newBase    = newName.replace(/\.[^.]+$/, '');
    const allFiles   = [primary, ...variants];

    // Build old→new path map for every file
    const renames = new Map();
    for (const f of allFiles) {
      const newFileName = f.name.replace(oldBase, newBase);
      const newPath     = `${dir}/${newFileName}`;
      renames.set(f.path, newPath);
    }

    // Move files
    let i = 0;
    for (const [src, dest] of renames) {
      setStatus(`Moving file ${++i} of ${renames.size}…`);
      await this.client.moveFile(src, dest, `Rename: ${src.split('/').pop()} → ${dest.split('/').pop()}`);
    }

    // Update post/page references
    setStatus('Updating references in posts…');
    return this.#updateReferences(renames);
  }

  async #updateReferences(renames) {
    const filePaths = new Set();

    const scanDir = async dir => {
      if (dir == null) return;
      try {
        const items = await this.client.listDir(dir || '');
        items
          .filter(i => i.type === 'file' && /\.(md|html?)$/i.test(i.name))
          .forEach(i => filePaths.add(i.path));
      } catch {}
    };

    await Promise.all([
      scanDir(this.config.postsPath),
      scanDir(this.config.pagesPath ?? null),
    ]);

    let updated = 0;
    for (const filePath of filePaths) {
      try {
        const file    = await this.client.getFile(filePath);
        let content   = file.content;
        let changed   = false;
        for (const [oldPath, newPath] of renames) {
          const needle = `/${oldPath}`;
          if (content.includes(needle)) {
            content = content.split(needle).join(`/${newPath}`);
            changed = true;
          }
        }
        if (changed) {
          await this.client.writeFile(filePath, content, 'Update media references after rename', file.sha);
          updated++;
        }
      } catch {}
    }

    return updated;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupItems(items) {
  // Build map: base name → sorted variant items
  const variantsByBase = new Map();
  for (const item of items) {
    const m = item.name.match(VARIANT_RE);
    if (!m) continue;
    const base = m[1];
    if (!variantsByBase.has(base)) variantsByBase.set(base, []);
    variantsByBase.get(base).push({ item, width: parseInt(m[2]) });
  }
  for (const arr of variantsByBase.values()) arr.sort((a, b) => a.width - b.width);

  const groups         = [];
  const claimedVariants = new Set();

  // Originals first (non-variant files)
  for (const item of items) {
    if (VARIANT_RE.test(item.name)) continue;
    const base     = item.name.replace(/\.[^.]+$/, '');
    const varArr   = variantsByBase.get(base) ?? [];
    const variants = varArr.map(v => v.item);
    variants.forEach(v => claimedVariants.add(v.name));
    groups.push({ primary: item, variants });
  }

  // Orphaned variant groups (original file was deleted / never existed)
  for (const arr of variantsByBase.values()) {
    const unclaimed = arr.filter(v => !claimedVariants.has(v.item.name));
    if (!unclaimed.length) continue;
    const primary  = unclaimed.at(-1).item;          // largest as representative
    const variants = unclaimed.slice(0, -1).map(v => v.item);
    groups.push({ primary, variants });
  }

  return groups;
}

function chipLabel(item) {
  const m = item.name.match(/-(\d+)w\.\w+$/);
  return m ? `${m[1]}w` : 'orig';
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
