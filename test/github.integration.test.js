/**
 * Integration tests — hit the real GitHub API.
 *
 * Run with:
 *   GITHUB_TOKEN=ghp_xxx npm run test:integration
 *
 * Skipped automatically when GITHUB_TOKEN is not set, so they never block CI
 * or a plain `npm test`. Each run creates and then deletes a temporary file
 * under cms/test-scratch/ so the repo stays clean. If a run is interrupted
 * before cleanup, delete anything in that folder manually.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitHubClient } from '../docs/js/github.js';
import { CONFIG } from '../docs/js/config.js';

const TOKEN    = process.env.GITHUB_TOKEN;
const TIMEOUT  = 15_000;

describe.skipIf(!TOKEN)('GitHubClient — real GitHub API', () => {
  let client;
  let testPath;
  let fileSha = null;   // tracked so afterAll can clean up even after a mid-run failure

  beforeAll(() => {
    client   = new GitHubClient(TOKEN, CONFIG.owner, CONFIG.repo, CONFIG.branch);
    testPath = `cms/test-scratch/integration-${Date.now()}.md`;
  });

  afterAll(async () => {
    if (!fileSha) return;
    try {
      await client.deleteFile(testPath, fileSha, 'test: cleanup integration scratch file');
    } catch {
      console.warn(`[integration] Could not clean up ${testPath} — delete manually`);
    }
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('authenticates and returns the user', { timeout: TIMEOUT }, async () => {
    const user = await client.getUser();
    expect(typeof user.login).toBe('string');
    expect(user.login.length).toBeGreaterThan(0);
  });

  // ── Create ────────────────────────────────────────────────────────────────

  it('commits a new file', { timeout: TIMEOUT }, async () => {
    const content = [
      '---',
      'title: "Integration test"',
      `date: ${new Date().toISOString().slice(0, 10)}`,
      'layout: post',
      '---',
      '',
      'Created by `npm run test:integration`. Safe to delete.',
    ].join('\n');

    const res = await client.writeFile(testPath, content, 'test: create integration scratch file');

    expect(res.content).toBeDefined();
    expect(typeof res.content.sha).toBe('string');
    expect(res.commit.sha).toBeDefined();
    expect(res.commit.message).toBe('test: create integration scratch file');

    fileSha = res.content.sha;
  });

  // ── Read ──────────────────────────────────────────────────────────────────

  it('reads the committed file back verbatim', { timeout: TIMEOUT }, async () => {
    const file = await client.getFile(testPath);

    expect(file.sha).toBe(fileSha);
    expect(file.content).toContain('Integration test');
    expect(file.content).toContain('layout: post');
  });

  it('rawUrl returns a URL that matches the expected pattern', () => {
    const url = client.rawUrl(testPath);
    expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    expect(url).toContain(CONFIG.owner);
    expect(url).toContain(CONFIG.repo);
    expect(url).toContain(testPath);
  });

  // ── Update ────────────────────────────────────────────────────────────────

  it('updates the file with a new commit', { timeout: TIMEOUT }, async () => {
    const updated = [
      '---',
      'title: "Integration test (updated)"',
      `date: ${new Date().toISOString().slice(0, 10)}`,
      'layout: post',
      '---',
      '',
      'Updated by integration test.',
    ].join('\n');

    const res = await client.writeFile(
      testPath,
      updated,
      'test: update integration scratch file',
      fileSha,   // must pass current SHA to update
    );

    expect(res.content.sha).not.toBe(fileSha);   // new blob SHA after update
    fileSha = res.content.sha;

    // Verify the new content is live
    const file = await client.getFile(testPath);
    expect(file.content).toContain('updated');
    expect(file.sha).toBe(fileSha);
  });

  it('rejects an update with a stale SHA', { timeout: TIMEOUT }, async () => {
    const stale = 'a'.repeat(40);   // valid-looking SHA that won't match
    await expect(
      client.writeFile(testPath, 'anything', 'should fail', stale)
    ).rejects.toThrow();
  });

  // ── Unicode ───────────────────────────────────────────────────────────────

  it('round-trips unicode content correctly', { timeout: TIMEOUT }, async () => {
    const emoji   = '# こんにちは 🎉\n\nUnicode: café, naïve, résumé.';
    const unicodePath = testPath.replace('.md', '-unicode.md');
    let unicodeSha = null;

    try {
      const res = await client.writeFile(unicodePath, emoji, 'test: unicode scratch file');
      unicodeSha = res.content.sha;

      const file = await client.getFile(unicodePath);
      expect(file.content).toBe(emoji);
    } finally {
      if (unicodeSha) {
        await client.deleteFile(unicodePath, unicodeSha, 'test: cleanup unicode scratch file');
      }
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it('deletes the file', { timeout: TIMEOUT }, async () => {
    await client.deleteFile(testPath, fileSha, 'test: delete integration scratch file');
    fileSha = null;   // tell afterAll the cleanup is already done

    await expect(client.getFile(testPath)).rejects.toThrow();
  });
});
