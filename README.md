# kev.cc CMS

A client-side CMS for this Jekyll/GitHub Pages blog. No server, no build step — just a static HTML+JS app that talks to the GitHub API directly.

---

## Quick start

### 1. Create a GitHub personal access token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name (`blog-cms`) and select the **`repo`** scope
4. Copy the token (GitHub only shows it once)

### 2. Open the CMS

Visit `/cms/` on your local Jekyll server, or push to GitHub and visit `https://kev.cc/cms/`.

Paste the token into the login screen and click **Connect**.

### 3. Done

The CMS scans the repo and shows your posts. Token is stored in `localStorage` — you stay logged in across page refreshes until you sign out.

---

## Features

| Feature | Details |
|---|---|
| Post list | Lists all posts from `collections/_posts/`, sorted by date |
| Post editor | Edit frontmatter fields + markdown, live preview on the right |
| New posts | Auto-generates filename from title + date (`YYYY-MM-DD-title.md`) |
| Media library | Grid of all images in `assets/images/` |
| Image upload | Drag-and-drop or click to upload; client-side resize before commit |
| Image picker | Browse media from inside the editor to set `thumbnail`/`image` |
| Delete | Delete posts and media (with confirmation) |
| Copy path | One click to copy the asset path for use in markdown |

---

## Architecture

```
cms/
├── index.html              # App shell — loads fonts, CSS, app.js
├── css/
│   └── app.css             # All styles (dark design, no framework)
├── js/
│   ├── config.js           # Repo owner/name/branch/paths — edit here
│   ├── github.js           # GitHub API client (auth, file R/W, binary upload)
│   ├── jekyll.js           # Frontmatter parser/serialiser, filename utils
│   ├── app.js              # Router, shell, auth, view orchestration
│   └── views/
│       ├── login.js        # Login screen + token guide dialog
│       ├── posts.js        # Post list view
│       ├── editor.js       # Post editor (frontmatter form + markdown/preview split)
│       └── media.js        # Media grid, upload modal, pick mode
└── test/
    ├── jekyll.test.js      # 23 tests for frontmatter parsing/serialisation
    └── github.test.js      # 12 tests for API client (fetch mocked)
```

**No dependencies at runtime.** The only external resource loaded is `marked.js` from `esm.sh` (CDN), used for the markdown preview. Everything else is vanilla ES modules.

**How auth works:** The GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) is sent as `Authorization: token {token}` on every request to `api.github.com`. GitHub's API has CORS headers, so browser `fetch` works directly. The token never touches any other server.

**How file writes work:** The GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`) lets you create or update a file in a single request. You provide the new content (base64-encoded), a commit message, and the current file's SHA (required for updates, omitted for new files). This creates a real git commit — the same as pushing from the command line.

---

## Running tests

```bash
cd cms
npm install
npm test          # run once
npm run test:watch  # watch mode
```

Tests cover:
- `jekyll.js` — frontmatter parsing, YAML serialisation, date handling, filename generation
- `github.js` — base64 encoding/decoding, API request shape, error handling (fetch mocked)

---

## Configuration

Edit `js/config.js` to change the target repository:

```js
export const CONFIG = {
  owner:     'thatkevin',            // GitHub username
  repo:      'thatkevin.github.io',  // Repository name
  branch:    'master',               // Branch to read/write
  postsPath: 'collections/_posts',   // Where Jekyll posts live
  mediaPath: 'assets/images',        // Where images are committed
  pagesPath: 'pages',                // (not yet used in UI)
  layouts:   ['post', 'slide', 'basic', 'default', 'category', 'home'],
};
```

---

## Extending

**Add a new frontmatter field:**
1. Add the HTML field to `EditorView.#metaFormHtml()` in `js/views/editor.js`
2. Wire it up in `#bindMeta()` using the `watch(id, key)` helper
3. Include it in the `fm` object inside `#save()`

**Add a new view (e.g. a Pages editor):**
1. Create `js/views/pages.js` following the same `render() / async bind(container)` pattern
2. Add a case to the `switch` in `app.js → renderView()`
3. Add a nav item in `renderShell()` with `data-route="pages"`

**Upgrade auth to device flow (for multi-user use):**
The GitHub [device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) doesn't require a client secret on the client, but GitHub's OAuth endpoints (`github.com/login/...`) don't have CORS headers. You'd need a small proxy — a Cloudflare Worker with ~15 lines of code handles the token exchange. Replace the PAT login in `views/login.js` with a device flow call to your Worker endpoint.

---

## Limitations

- **No draft/publish state** — saving commits directly to the live branch
- **Image size** — GitHub's API limit is 100 MB; practically, keep images under 10 MB
- **GitHub API rate limit** — 5,000 requests/hour with a PAT; more than enough for a CMS
- **No undo** — deletes create git commits, so you can always recover via git history, but there's no UI for it
- **Single user** — designed for one person with one token; multiple editors would need OAuth + branch-based drafts
