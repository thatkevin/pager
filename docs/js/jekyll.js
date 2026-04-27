export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let val   = line.slice(idx + 1).trim();

    if (!key) continue;

    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1)
        .split(',')
        .map(v => unquote(v.trim()))
        .filter(Boolean);
    } else {
      val = unquote(val);
    }

    fm[key] = val;
  }

  return { frontmatter: fm, body: match[2] };
}

export function stringifyFrontmatter(fm) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null || v === '') continue;

    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(s => `"${s}"`).join(', ')}]`);
    } else {
      const s = String(v);
      const needsQuotes = s.includes(':') || s.includes('#') || s.startsWith('"');
      lines.push(`${k}: ${needsQuotes ? `"${s.replace(/"/g, '\\"')}"` : s}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

export function buildPostContent(fm, body) {
  return stringifyFrontmatter(fm) + body;
}

export function dateToIso(date) {
  if (!date) return new Date().toISOString().slice(0, 10);
  // Extract YYYY-MM-DD regardless of trailing timezone/time junk Jekyll may add
  const match = String(date).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

export function filenameFromPost(fm) {
  const date = dateToIso(fm.date || new Date());
  const slug = (fm.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `${date}-${slug}.md`;
}

export function filenameToMeta(filename) {
  const base  = filename.replace(/\.md$/, '');
  const match = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match) return { date: '', slug: base, title: titleCase(base) };
  return {
    date:  match[1],
    slug:  match[2],
    title: titleCase(match[2]),
  };
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function titleCase(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
