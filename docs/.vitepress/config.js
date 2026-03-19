import { text } from 'stream/consumers';

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
          { text: 'Reader Integration', link: '/reader' },
          { text: 'Command Palette', link: '/command-palette' },
          { text: 'Embedded Task Lists', link: '/embedded-task-lists' },
          { text: 'Import', link: '/import' },
          { text: 'Moving Tasks', link: '/moving-tasks' },
          { text: 'Search', link: '/search' },
          { text: 'Settings', link: '/settings' },
          { text: 'Sort Methods', link: '/sort-methods' },
          { text: 'Task Urgency', link: '/urgency' },
          { text: 'Experiemental', link: '/experiemental-features' },
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
