export default {
  title: 'TODOseq',
  description: 'Lightweight, keyword-based task tracker for Obsidian',
  base: '/obsidian-todoseq/',
  outline: [2, 3],

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
          { text: 'Task Entry', link: '/task-entry' },
          { text: 'Task List', link: '/task-list' },
          { text: 'Editor Integration', link: '/editor' },
          { text: 'Reader Integration', link: '/reader' },
          { text: 'Command Palette', link: '/command-palette' },
          { text: 'Embedded Task Lists', link: '/embedded-task-lists' },
        ],
      },
      {
        text: 'Find & organize',
        items: [
          { text: 'Search', link: '/search' },
          { text: 'Sort Methods', link: '/sort-methods' },
          { text: 'Task Urgency', link: '/urgency' },
          { text: 'Warning Periods', link: '/warning-periods' },
          { text: 'Moving Tasks', link: '/moving-tasks' },
          { text: 'Import', link: '/import' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Settings', link: '/settings' },
          { text: 'Experimental', link: '/experimental-features' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/scross01/obsidian-todoseq' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Stephen Cross',
    },
  },
};
