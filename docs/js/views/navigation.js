import yaml from '../vendor/js-yaml.js';

export class NavigationView {
  constructor(client, config, { toast }) {
    this.client = client;
    this.config = config;
    this.toast  = toast;
    this.items  = [];
    this.sha    = null;
    this.path   = '_data/menu.yml';
  }

  render() {
    return `
      <div class="posts-view">
        <div class="page-header">
          <h1>Navigation</h1>
          <div class="actions">
            <button class="btn btn-primary" id="save-nav-btn">Save changes</button>
          </div>
        </div>
        <div class="posts-table-wrap">
          <div class="loading-state" id="nav-loading">
            <div class="spinner"></div>
            <span>Loading navigation…</span>
          </div>
          <div id="nav-editor" style="display:none">
            <div class="nav-editor-list" id="nav-items-list"></div>
            <div style="padding: 0 28px 40px">
              <button class="btn btn-ghost" id="add-nav-item-btn">+ Add item</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async bind(container) {
    this.container = container;
    container.querySelector('#save-nav-btn').addEventListener('click', () => this.#save());
    container.querySelector('#add-nav-item-btn').addEventListener('click', () => this.#addItem());
    await this.#load();
  }

  async #load() {
    const loading = this.container.querySelector('#nav-loading');
    const editor  = this.container.querySelector('#nav-editor');

    try {
      const file = await this.client.getFile(this.path);
      this.sha   = file.sha;
      this.data  = yaml.load(file.content) || {};
      // We expect { main: [ {name, url}, ... ] }
      this.items = (this.data.main && Array.isArray(this.data.main)) ? this.data.main : [];
      
      loading.style.display = 'none';
      editor.style.display  = 'block';
      this.#renderItems();
    } catch (e) {
      if (e.message.includes('404')) {
        this.data  = {};
        this.items = [];
        loading.style.display = 'none';
        editor.style.display  = 'block';
        this.#renderItems();
      } else {
        loading.innerHTML = `<span style="color:var(--red)">${e.message}</span>`;
      }
    }
  }

  #renderItems() {
    const list = this.container.querySelector('#nav-items-list');
    if (this.items.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No navigation items found.</p></div>';
    } else {
      list.innerHTML = this.items.map((item, index) => `
        <div class="nav-editor-item" data-index="${index}">
          <div class="fields">
            <div class="field" style="flex:1">
              <label>Label</label>
              <input type="text" class="nav-item-name" value="${this.#esc(item.name)}" placeholder="e.g. Home">
            </div>
            <div class="field" style="flex:2">
              <label>URL</label>
              <input type="text" class="nav-item-url" value="${this.#esc(item.url)}" placeholder="e.g. /about/">
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-ghost btn-sm move-up-btn" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-ghost btn-sm move-down-btn" title="Move down" ${index === this.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-ghost btn-sm btn-danger delete-item-btn" title="Delete">×</button>
          </div>
        </div>
      `).join('');
    }

    list.querySelectorAll('.nav-editor-item').forEach(el => {
      const index = parseInt(el.dataset.index, 10);
      
      el.querySelector('.nav-item-name').addEventListener('input', e => {
        this.items[index].name = e.target.value;
      });
      el.querySelector('.nav-item-url').addEventListener('input', e => {
        this.items[index].url = e.target.value;
      });
      el.querySelector('.move-up-btn').addEventListener('click', () => this.#move(index, -1));
      el.querySelector('.move-down-btn').addEventListener('click', () => this.#move(index, 1));
      el.querySelector('.delete-item-btn').addEventListener('click', () => this.#delete(index));
    });
  }

  #addItem() {
    this.items.push({ name: '', url: '' });
    this.#renderItems();
  }

  #delete(index) {
    this.items.splice(index, 1);
    this.#renderItems();
  }

  #move(index, delta) {
    const item = this.items.splice(index, 1)[0];
    this.items.splice(index + delta, 0, item);
    this.#renderItems();
  }

  async #save() {
    const btn = this.container.querySelector('#save-nav-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      this.data.main = this.items;
      const content = yaml.dump(this.data);
      const res = await this.client.writeFile(this.path, content, 'Update navigation', this.sha);
      this.sha = res.content.sha;
      this.toast('Navigation saved', 'success');
    } catch (e) {
      this.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  #esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
