// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PagesView } from '../docs/js/views/pages.js';

vi.mock('../docs/js/drafts.js', () => ({
  deleteDraft: vi.fn(),
  draftsByPath: vi.fn().mockReturnValue({}),
}));

describe('PagesView', () => {
  let client;
  let config;
  let toast;
  let onEdit;
  let onNew;
  let view;
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      listDir: vi.fn().mockResolvedValue([]),
      getFile: vi.fn().mockResolvedValue({ sha: '123', path: 'test.md' }),
      deleteFile: vi.fn().mockResolvedValue({}),
    };
    config = {
      pagesPath: 'pages',
    };
    toast = vi.fn();
    onEdit = vi.fn();
    onNew = vi.fn();
    view = new PagesView(client, config, { toast, onEdit, onNew });
    container = document.createElement('div');
    container.innerHTML = view.render();
  });

  it('renders the header and table', () => {
    expect(container.querySelector('h1').textContent).toBe('Pages');
    expect(container.querySelector('#pages-table')).not.toBeNull();
  });

  it('loads and displays pages', async () => {
    client.listDir.mockResolvedValue([
      { name: 'about.md', path: 'pages/about.md', type: 'file', sha: 'sha1' },
      { name: 'contact.html', path: 'pages/contact.html', type: 'file', sha: 'sha2' },
    ]);

    await view.bind(container);

    const rows = container.querySelectorAll('#pages-tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.post-title').textContent).toContain('About');
    expect(rows[1].querySelector('.post-title').textContent).toContain('Contact');
  });

  it('calls deleteFile and removes row on delete confirmation', async () => {
    client.listDir.mockResolvedValue([
      { name: 'about.md', path: 'pages/about.md', type: 'file', sha: 'sha1' },
    ]);
    
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    await view.bind(container);
    
    const deleteBtn = container.querySelector('.delete-btn');
    await deleteBtn.click();

    // We need to wait for the async delete handler to finish
    // Since it's an event listener, we might need a small delay or use flush-promises pattern
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(client.getFile).toHaveBeenCalledWith('pages/about.md');
    expect(client.deleteFile).toHaveBeenCalledWith('pages/about.md', '123', 'Delete page: about.md');
    expect(container.querySelectorAll('#pages-tbody tr').length).toBe(0);
    expect(toast).toHaveBeenCalledWith('Page deleted.', 'success');
  });

  it('does not delete if confirmation is cancelled', async () => {
    client.listDir.mockResolvedValue([
      { name: 'about.md', path: 'pages/about.md', type: 'file', sha: 'sha1' },
    ]);
    
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    await view.bind(container);
    
    const deleteBtn = container.querySelector('.delete-btn');
    await deleteBtn.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(client.deleteFile).not.toHaveBeenCalled();
    expect(container.querySelectorAll('#pages-tbody tr').length).toBe(1);
  });
});
