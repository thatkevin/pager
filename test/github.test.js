import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubClient } from '../docs/js/github.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  });
}

function lastFetchCall() {
  return global.fetch.mock.calls[0];
}

function lastFetchBody() {
  return JSON.parse(lastFetchCall()[1].body);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GitHubClient', () => {
  let client;

  beforeEach(() => {
    client = new GitHubClient('test-token', 'owner', 'repo', 'main');
  });

  afterEach(() => vi.restoreAllMocks());

  describe('getUser', () => {
    it('calls /user with auth header', async () => {
      mockFetch(200, { login: 'thatkevin', avatar_url: 'https://example.com/avatar.jpg' });
      const user = await client.getUser();
      expect(user.login).toBe('thatkevin');
      const [url, opts] = lastFetchCall();
      expect(url).toContain('/user');
      expect(opts.headers.Authorization).toBe('token test-token');
    });
  });

  describe('listDir', () => {
    it('requests the correct repo path with branch ref', async () => {
      mockFetch(200, []);
      await client.listDir('collections/_posts');
      const [url] = lastFetchCall();
      expect(url).toContain('/repos/owner/repo/contents/collections/_posts');
      expect(url).toContain('ref=main');
    });
  });

  describe('getFile', () => {
    it('decodes base64 content correctly', async () => {
      const original = 'Hello, World! こんにちは';
      const bytes    = new TextEncoder().encode(original);
      const bin      = Array.from(bytes, b => String.fromCharCode(b)).join('');
      const b64      = btoa(bin);

      mockFetch(200, { content: b64, sha: 'abc123', path: 'test.md' });
      const file = await client.getFile('test.md');
      expect(file.content).toBe(original);
      expect(file.sha).toBe('abc123');
    });

    it('handles chunked base64 with newlines (GitHub API style)', async () => {
      const plain = 'Test content';
      const b64   = btoa(plain).match(/.{1,60}/g).join('\n');
      mockFetch(200, { content: b64, sha: 'xyz', path: 'file.md' });
      const file  = await client.getFile('file.md');
      expect(file.content).toBe(plain);
    });
  });

  describe('writeFile', () => {
    it('creates a new file (no sha)', async () => {
      mockFetch(201, { content: { sha: 'newsha' } });
      await client.writeFile('path/file.md', '# Hello', 'Add file');
      const body = lastFetchBody();
      expect(body.message).toBe('Add file');
      expect(body.branch).toBe('main');
      expect(body.sha).toBeUndefined();
      expect(typeof body.content).toBe('string');
    });

    it('updates an existing file (with sha)', async () => {
      mockFetch(200, { content: { sha: 'updatedsha' } });
      await client.writeFile('path/file.md', '# Updated', 'Update file', 'existingsha');
      const body = lastFetchBody();
      expect(body.sha).toBe('existingsha');
    });

    it('encodes content as base64', async () => {
      mockFetch(200, { content: { sha: 'sha' } });
      const content = '# Test\n\nHello.';
      await client.writeFile('file.md', content, 'msg');
      const body    = lastFetchBody();
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(body.content), c => c.charCodeAt(0))
      );
      expect(decoded).toBe(content);
    });

    it('handles unicode in content', async () => {
      mockFetch(200, { content: { sha: 'sha' } });
      const content = '# こんにちは\n\n日本語のコンテンツ。';
      await client.writeFile('file.md', content, 'msg');
      const body    = lastFetchBody();
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(body.content), c => c.charCodeAt(0))
      );
      expect(decoded).toBe(content);
    });
  });

  describe('deleteFile', () => {
    it('sends DELETE with correct sha', async () => {
      mockFetch(200, {});
      await client.deleteFile('path/file.md', 'deleteme', 'Delete file');
      const [url, opts] = lastFetchCall();
      expect(opts.method).toBe('DELETE');
      expect(url).toContain('/repos/owner/repo/contents/path/file.md');
      const body = JSON.parse(opts.body);
      expect(body.sha).toBe('deleteme');
    });
  });

  describe('rawUrl', () => {
    it('returns the correct raw.githubusercontent.com URL', () => {
      const url = client.rawUrl('assets/images/photo.jpg');
      expect(url).toBe('https://raw.githubusercontent.com/owner/repo/main/assets/images/photo.jpg');
    });
  });

  describe('error handling', () => {
    it('throws on 401 with GitHub message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok:     false,
        status: 401,
        json:   () => Promise.resolve({ message: 'Bad credentials' }),
      });
      await expect(client.getUser()).rejects.toThrow('Bad credentials');
    });

    it('throws on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok:     false,
        status: 404,
        json:   () => Promise.resolve({ message: 'Not Found' }),
      });
      await expect(client.getFile('missing.md')).rejects.toThrow('Not Found');
    });
  });
});
