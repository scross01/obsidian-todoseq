export default {
  title: 'TODOseq',
  description: 'Lightweight, keyword-based task tracker for Obsidian',
  base: '/obsidian-todoseq/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Install', link: 'https://obsidian.md/plugins?id=todoseq' },
      { text: 'GitHub', link: 'https://github.com/scross01/obsidian-todoseq' },
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
          { text: 'Task Urgency', link: '/urgency' },
          { text: 'Import', link: '/import' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/scross01/obsidian-todoseq' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Stephen Cross',
    },
  },
};
