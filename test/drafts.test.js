import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveDraft, loadDraft, deleteDraft, listDrafts, hasDraft, draftsByPath } from '../docs/js/drafts.js';

// ── localStorage mock ────────────────────────────────────────────────────────

function makeStore() {
  const store = {};
  return {
    getItem:    key       => store[key] ?? null,
    setItem:    (key, v)  => { store[key] = String(v); },
    removeItem: key       => { delete store[key]; },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStore());
});

// ── saveDraft / loadDraft ────────────────────────────────────────────────────

describe('saveDraft / loadDraft', () => {
  it('round-trips fm and body', () => {
    const fm   = { title: 'Test', date: '2024-01-01', layout: 'post', categories: ['Dev'] };
    const body = '## Hello\n\nSome content.';
    saveDraft('post-1', { fm, body });
    const draft = loadDraft('post-1');
    expect(draft.fm).toEqual(fm);
    expect(draft.body).toBe(body);
  });

  it('stores the associated file path', () => {
    saveDraft('abc', { fm: {}, body: '', path: 'collections/_posts/2024-01-01-hello.md' });
    expect(loadDraft('abc').path).toBe('collections/_posts/2024-01-01-hello.md');
  });

  it('stores null path for new posts', () => {
    saveDraft('new-123', { fm: {}, body: '' });
    expect(loadDraft('new-123').path).toBeNull();
  });

  it('records savedAt as an ISO timestamp', () => {
    const before = new Date().toISOString();
    saveDraft('ts-test', { fm: {}, body: '' });
    const after = new Date().toISOString();
    const { savedAt } = loadDraft('ts-test');
    expect(savedAt >= before).toBe(true);
    expect(savedAt <= after).toBe(true);
  });

  it('returns null for unknown id', () => {
    expect(loadDraft('does-not-exist')).toBeNull();
  });

  it('overwrites an existing draft', () => {
    saveDraft('x', { fm: { title: 'First' }, body: 'v1' });
    saveDraft('x', { fm: { title: 'Second' }, body: 'v2' });
    const draft = loadDraft('x');
    expect(draft.fm.title).toBe('Second');
    expect(draft.body).toBe('v2');
  });
});

// ── deleteDraft ──────────────────────────────────────────────────────────────

describe('deleteDraft', () => {
  it('removes the draft', () => {
    saveDraft('del-me', { fm: {}, body: '' });
    deleteDraft('del-me');
    expect(loadDraft('del-me')).toBeNull();
  });

  it('is a no-op for unknown ids', () => {
    expect(() => deleteDraft('ghost')).not.toThrow();
  });

  it('only removes the targeted draft', () => {
    saveDraft('keep',   { fm: { title: 'Keep' }, body: '' });
    saveDraft('remove', { fm: { title: 'Remove' }, body: '' });
    deleteDraft('remove');
    expect(loadDraft('keep')).not.toBeNull();
    expect(loadDraft('remove')).toBeNull();
  });
});

// ── listDrafts ───────────────────────────────────────────────────────────────

describe('listDrafts', () => {
  it('returns an empty array when there are no drafts', () => {
    expect(listDrafts()).toEqual([]);
  });

  it('returns all drafts with their ids', () => {
    saveDraft('a', { fm: { title: 'A' }, body: '' });
    saveDraft('b', { fm: { title: 'B' }, body: '' });
    const drafts = listDrafts();
    expect(drafts).toHaveLength(2);
    expect(drafts.map(d => d.id).sort()).toEqual(['a', 'b']);
  });
});

// ── hasDraft ─────────────────────────────────────────────────────────────────

describe('hasDraft', () => {
  it('returns true when a draft exists', () => {
    saveDraft('exists', { fm: {}, body: '' });
    expect(hasDraft('exists')).toBe(true);
  });

  it('returns false when no draft exists', () => {
    expect(hasDraft('missing')).toBe(false);
  });
});

// ── draftsByPath ─────────────────────────────────────────────────────────────

describe('draftsByPath', () => {
  it('maps file paths to draft ids', () => {
    saveDraft('draft-1', { fm: {}, body: '', path: 'collections/_posts/2024-01-01-hello.md' });
    saveDraft('draft-2', { fm: {}, body: '', path: 'collections/_posts/2024-02-01-world.md' });
    saveDraft('new-abc', { fm: {}, body: '', path: null });

    const map = draftsByPath();
    expect(map['collections/_posts/2024-01-01-hello.md']).toBe('draft-1');
    expect(map['collections/_posts/2024-02-01-world.md']).toBe('draft-2');
    expect(Object.keys(map)).toHaveLength(2);  // null path excluded
  });

  it('returns an empty object when no path-based drafts exist', () => {
    saveDraft('new-1', { fm: {}, body: '', path: null });
    expect(draftsByPath()).toEqual({});
  });
});
