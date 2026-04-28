const BASE = 'https://api.github.com';

function b64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin);
}

function b64Decode(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function blobToB64(blob) {
  const buf = await blob.arrayBuffer();
  const bin = Array.from(new Uint8Array(buf), b => String.fromCharCode(b)).join('');
  return btoa(bin);
}

export class GitHubClient {
  #token;
  #owner;
  #repo;
  #branch;

  constructor(token, owner, repo, branch = 'master') {
    this.#token  = token;
    this.#owner  = owner;
    this.#repo   = repo;
    this.#branch = branch;
  }

  async #req(path, opts = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: `token ${this.#token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });

    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `GitHub ${res.status}`);
    return data;
  }

  async getUser() {
    return this.#req('/user');
  }

  async listDir(path) {
    return this.#req(`/repos/${this.#owner}/${this.#repo}/contents/${path}?ref=${this.#branch}`);
  }

  async getFile(path) {
    const data = await this.#req(
      `/repos/${this.#owner}/${this.#repo}/contents/${path}?ref=${this.#branch}`
    );
    return { content: b64Decode(data.content), sha: data.sha, path: data.path };
  }

  async writeFile(path, content, message, sha = null) {
    const body = {
      message,
      content: b64Encode(content),
      branch: this.#branch,
    };
    if (sha) body.sha = sha;
    return this.#req(`/repos/${this.#owner}/${this.#repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async uploadBinary(path, blob, message, sha = null) {
    const content = await blobToB64(blob);
    const body = { message, content, branch: this.#branch };
    if (sha) body.sha = sha;
    return this.#req(`/repos/${this.#owner}/${this.#repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async moveFile(srcPath, destPath, message) {
    const data = await this.#req(
      `/repos/${this.#owner}/${this.#repo}/contents/${srcPath}?ref=${this.#branch}`
    );
    const base64 = data.content.replace(/\n/g, '');
    const srcSha = data.sha;
    await this.#req(`/repos/${this.#owner}/${this.#repo}/contents/${destPath}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: base64, branch: this.#branch }),
    });
    await this.deleteFile(srcPath, srcSha, message);
  }

  async deleteFile(path, sha, message) {
    return this.#req(`/repos/${this.#owner}/${this.#repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.#branch }),
    });
  }

  async getLatestRun() {
    const data = await this.#req(
      `/repos/${this.#owner}/${this.#repo}/actions/runs?branch=${this.#branch}&per_page=1`
    );
    return data.workflow_runs?.[0] ?? null;
  }

  rawUrl(path) {
    return `https://raw.githubusercontent.com/${this.#owner}/${this.#repo}/${this.#branch}/${path}`;
  }

  async getConfigYml() {
    try {
      const f = await this.getFile('_config.yml');
      return f.content;
    } catch { return null; }
  }

  withRepo(owner, repo, branch) {
    return new GitHubClient(this.#token, owner, repo, branch);
  }

  async listInstallationRepos() {
    const installs = await this.#req('/user/installations?per_page=100');
    const results = [];
    for (const inst of installs.installations ?? []) {
      try {
        const r = await this.#req(`/user/installations/${inst.id}/repositories?per_page=100`);
        results.push(...(r.repositories ?? []));
      } catch {}
    }
    return results;
  }

  async listUserRepos() {
    const data = await this.#req('/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator');
    return Array.isArray(data) ? data : [];
  }
}
