import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  stringifyFrontmatter,
  buildPostContent,
  dateToIso,
  filenameFromPost,
  filenameToMeta,
} from '../docs/js/jekyll.js';

// ── parseFrontmatter ─────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('parses a standard Jekyll post', () => {
    const raw = `---
title: "Hello World"
date: 2024-01-10T00:00:00+
layout: post
categories: ["Dev", "Talks"]
description: A test post
---

Body content here.
`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('Hello World');
    expect(frontmatter.date).toBe('2024-01-10T00:00:00+');
    expect(frontmatter.layout).toBe('post');
    expect(frontmatter.categories).toEqual(['Dev', 'Talks']);
    expect(frontmatter.description).toBe('A test post');
    expect(body.trim()).toBe('Body content here.');
  });

  it('handles a title with colons inside quotes', () => {
    const raw = `---
title: "cov.kids: an events aggregator for Coventry"
date: 2026-03-09
---

Body.
`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('cov.kids: an events aggregator for Coventry');
  });

  it('handles single-item categories', () => {
    const raw = `---
categories: ["Dev"]
---
`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.categories).toEqual(['Dev']);
  });

  it('handles empty body', () => {
    const raw = `---
title: "Empty"
---
`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('Empty');
    expect(body).toBe('');
  });

  it('returns raw string when no frontmatter present', () => {
    const raw = 'Just a plain markdown file.';
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(body).toBe(raw);
  });

  it('handles image paths with slashes', () => {
    const raw = `---
thumbnail: "/assets/images/photo.jpg"
image: "/assets/images/photo.jpg"
---
`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.thumbnail).toBe('/assets/images/photo.jpg');
    expect(frontmatter.image).toBe('/assets/images/photo.jpg');
  });
});

// ── stringifyFrontmatter ─────────────────────────────────────────────────────

describe('stringifyFrontmatter', () => {
  it('produces valid YAML block', () => {
    const fm = {
      title:       'Hello World',
      date:        '2024-01-10',
      layout:      'post',
      categories:  ['Dev'],
      description: 'A test',
    };
    const out = stringifyFrontmatter(fm);
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/\n---\n$/);
    expect(out).toContain('title: Hello World');
    expect(out).toContain('layout: post');
    expect(out).toContain('categories: ["Dev"]');
  });

  it('quotes values containing colons', () => {
    const fm = { title: 'cov.kids: an aggregator' };
    const out = stringifyFrontmatter(fm);
    expect(out).toContain(`title: "cov.kids: an aggregator"`);
  });

  it('skips null and empty values', () => {
    const fm = { title: 'Test', thumbnail: '', image: null };
    const out = stringifyFrontmatter(fm);
    expect(out).not.toContain('thumbnail');
    expect(out).not.toContain('image');
  });

  it('serialises multiple categories', () => {
    const fm = { categories: ['Dev', 'Talks', 'Design'] };
    const out = stringifyFrontmatter(fm);
    expect(out).toContain('categories: ["Dev", "Talks", "Design"]');
  });
});

// ── buildPostContent ─────────────────────────────────────────────────────────

describe('buildPostContent', () => {
  it('round-trips through parse/build', () => {
    const fm   = { title: 'My Post', date: '2024-06-01', layout: 'post', categories: ['Dev'] };
    const body = '## Hello\n\nSome content.\n';
    const content = buildPostContent(fm, body);
    const parsed  = parseFrontmatter(content);
    expect(parsed.frontmatter.title).toBe('My Post');
    expect(parsed.frontmatter.categories).toEqual(['Dev']);
    expect(parsed.body).toBe(body);
  });
});

// ── dateToIso ────────────────────────────────────────────────────────────────

describe('dateToIso', () => {
  it('extracts date from Jekyll-style timestamp', () => {
    expect(dateToIso('2024-01-10T00:00:00+')).toBe('2024-01-10');
  });

  it('handles plain date strings', () => {
    expect(dateToIso('2026-03-09')).toBe('2026-03-09');
  });

  it('handles full ISO strings', () => {
    expect(dateToIso('2024-06-15T12:00:00.000Z')).toBe('2024-06-15');
  });

  it('falls back to today for null', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(dateToIso(null)).toBe(today);
    expect(dateToIso('')).toBe(today);
  });

  it('falls back to today for unparseable strings', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(dateToIso('not-a-date')).toBe(today);
  });
});

// ── filenameFromPost ─────────────────────────────────────────────────────────

describe('filenameFromPost', () => {
  it('generates slug from title and date', () => {
    const name = filenameFromPost({ title: 'Hello World', date: '2024-01-10' });
    expect(name).toBe('2024-01-10-hello-world.md');
  });

  it('strips special characters from title', () => {
    const name = filenameFromPost({ title: 'cov.kids: an aggregator!', date: '2026-03-09' });
    expect(name).toBe('2026-03-09-covkids-an-aggregator.md');
  });

  it('collapses multiple hyphens', () => {
    const name = filenameFromPost({ title: 'A   B --- C', date: '2024-05-01' });
    expect(name).toBe('2024-05-01-a-b-c.md');
  });

  it('uses today when date is missing', () => {
    const today = new Date().toISOString().slice(0, 10);
    const name  = filenameFromPost({ title: 'No Date' });
    expect(name).toBe(`${today}-no-date.md`);
  });
});

// ── filenameToMeta ───────────────────────────────────────────────────────────

describe('filenameToMeta', () => {
  it('extracts date, slug, and title', () => {
    const meta = filenameToMeta('2024-01-10-sky-computing.md');
    expect(meta.date).toBe('2024-01-10');
    expect(meta.slug).toBe('sky-computing');
    expect(meta.title).toBe('Sky Computing');
  });

  it('handles multi-word slugs', () => {
    const meta = filenameToMeta('2023-06-10-sub-five-pound-pints.md');
    expect(meta.date).toBe('2023-06-10');
    expect(meta.title).toBe('Sub Five Pound Pints');
  });

  it('handles files without date prefix gracefully', () => {
    const meta = filenameToMeta('about.md');
    expect(meta.date).toBe('');
    expect(meta.slug).toBe('about');
  });
});
