import { scanAssetUsage } from '../scripts/screenshots/usage-scan';

/** Tiny in-memory FS shim: path -> content. */
function makeReader(files: Record<string, string>) {
  return (p: string) => {
    const content = files[p];
    return content === undefined ? null : content;
  };
}

describe('screenshot usage scan', () => {
  const assets = [
    'todoseq-editor-view.png',
    'todoseq-settings.png',
    'todoseq-task-entry.gif',
    'todoseq-ribbon-icon.png',
    'todoseq-orphan.png',
  ];

  it('finds assets referenced with the ./assets/ relative pattern', () => {
    const files = {
      'docs/introduction.md':
        '![alt](./assets/todoseq-editor-view.png){.ts-img-full}',
    };
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.has('todoseq-editor-view.png')).toBe(true);
    expect(usage.unreferenced).toEqual([
      'todoseq-orphan.png',
      'todoseq-ribbon-icon.png',
      'todoseq-settings.png',
      'todoseq-task-entry.gif',
    ]);
  });

  it('finds assets referenced with the bare assets/ pattern', () => {
    const files = {
      'README.md': '![alt](assets/todoseq-settings.png)',
    };
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.has('todoseq-settings.png')).toBe(true);
    expect(usage.unreferenced).toEqual([
      'todoseq-editor-view.png',
      'todoseq-orphan.png',
      'todoseq-ribbon-icon.png',
      'todoseq-task-entry.gif',
    ]);
  });

  it('finds gif assets too', () => {
    const files = {
      'docs/index.md': '![hero](./assets/todoseq-task-entry.gif)',
    };
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.has('todoseq-task-entry.gif')).toBe(true);
  });

  it('searches all supplied files including docs config', () => {
    const files = {
      'docs/.vitepress/config.mts':
        "favicon: '/assets/todoseq-ribbon-icon.png'",
    };
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.has('todoseq-ribbon-icon.png')).toBe(true);
  });

  it('reports every asset with no reference as unreferenced, sorted', () => {
    const files = {};
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.size).toBe(0);
    expect(usage.unreferenced).toEqual([
      'todoseq-editor-view.png',
      'todoseq-orphan.png',
      'todoseq-ribbon-icon.png',
      'todoseq-settings.png',
      'todoseq-task-entry.gif',
    ]);
  });

  it('does not match a name embedded in a longer filename', () => {
    const files = {
      'docs/x.md': '![alt](./assets/todoseq-editor-view.png.bak.png)',
    };
    const usage = scanAssetUsage(assets, Object.keys(files), makeReader(files));
    expect(usage.referenced.has('todoseq-editor-view.png')).toBe(false);
    expect(usage.unreferenced).toContain('todoseq-editor-view.png');
  });
});
