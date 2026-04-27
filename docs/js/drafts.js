const KEY = 'cms_drafts';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function persist(drafts) {
  localStorage.setItem(KEY, JSON.stringify(drafts));
}

export function saveDraft(id, { fm, body, path = null }) {
  const drafts = load();
  drafts[id] = { fm, body, path, savedAt: new Date().toISOString() };
  persist(drafts);
}

export function loadDraft(id) {
  return load()[id] ?? null;
}

export function deleteDraft(id) {
  const drafts = load();
  delete drafts[id];
  persist(drafts);
}

export function listDrafts() {
  return Object.entries(load()).map(([id, data]) => ({ id, ...data }));
}

export function hasDraft(id) {
  return id in load();
}

// Returns all draft IDs keyed by their associated file path (for existing posts)
export function draftsByPath() {
  const out = {};
  for (const [id, data] of Object.entries(load())) {
    if (data.path) out[data.path] = id;
  }
  return out;
}
