export const CONFIG = {
  owner:     'thatkevin',
  repo:      'thatkevin.github.io',
  branch:    'master',
  postsPath: 'collections/_posts',
  mediaPath: 'assets/images',
  pagesPath: 'pages',
  layouts:   ['post', 'slide', 'basic', 'default', 'category', 'home'],
  // URL of the pager-auth Cloudflare Worker (enables GitHub OAuth login).
  // Leave empty to require a personal access token instead.
  workerUrl: 'https://pager-auth.kevs.workers.dev',
};
