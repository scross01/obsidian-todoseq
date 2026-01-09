export default {
  title: 'TODOseq',
  description: 'Lightweight, keyword-based task tracker for Obsidian',
  base: '/todoseq/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'GitHub', link: 'https://scross01.github.io/obsidian-todoseq' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Task List', link: '/task-list' },
          { text: 'Task Entry', link: '/task-entry' },
          { text: 'Editor Integration', link: '/editor' },
          { text: 'Search', link: '/search' },
          { text: 'Settings', link: '/settings' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/scross01/todoseq' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Stephen Cross',
    },
  },
};
