export const CONFIG = {
  // GitHub App — slug is the name in github.com/apps/{slug}.
  githubAppSlug:  'pager-cms',
  githubClientId: 'Iv23li7Ksx4uBQtXTtW1',
  // URL of the pager-auth Cloudflare Worker.
  workerUrl: 'https://pager-auth.kevs.workers.dev',
  // Fallback defaults used when auto-detection finds nothing.
  defaults: {
    branch:    'main',
    postsPath: '_posts',
    mediaPath: 'assets/images',
    layouts:   ['post', 'page', 'default'],
  },
};
