import { PropertySearchEngine } from '../src/services/property-search-engine';
import { App, TFile } from 'obsidian';

// Create simple mock files with known properties
const createMockFile = (index: number, hasProperties: boolean = true): TFile => {
  const fileNum = index;
  const frontmatter: any = hasProperties ? {
    status: fileNum % 2 === 0 ? 'draft' : 'published',
    priority: fileNum % 3 === 0 ? 'high' : 'normal',
    tags: fileNum % 4 === 0 ? ['work', 'urgent'] : ['personal'],
    type: 'task',
  } : {};

  return {
    path: `file-${index}.md`,
    name: `file-${index}.md`,
    basename: `file-${index}`,
    extension: 'md',
    stat: { size: 1024, mtime: Date.now() },
  } as TFile;
};

// Simple mock app with known files
const mockApp = {
  vault: {
    getMarkdownFiles: () => {
      // Create 20 test files with properties
      const files = [];
      for (let i = 0; i < 20; i++) {
        files.push(createMockFile(i, i % 5 !== 0)); // 80% have properties
      }
      return files;
    },
  },
  metadataCache: {
    getFileCache: (file: TFile) => {
      const fileName = file.name; // e.g., "file-0.md"
      const fileNum = parseInt(fileName.replace('file-', '').replace('.md', ''));
      const hasProperties = fileNum % 5 !== 0;
      
      if (!hasProperties) return null;
      
      const frontmatter: any = {
        status: fileNum % 2 === 0 ? 'draft' : 'published',
        priority: fileNum % 3 === 0 ? 'high' : 'normal',
        tags: fileNum % 4 === 0 ? ['work', 'urgent'] : ['personal'],
        type: 'task',
      };
      
      return { frontmatter };
    },
    getAllPropertyInfos: () => {
      return {
        status: { type: 'string' },
        priority: { type: 'string' },
        tags: { type: 'array' },
        type: { type: 'string' },
      };
    },
    on: jest.fn(),
  },
} as unknown as App;

describe('PropertySearchEngine Simple Tests', () => {
  let propertySearchEngine: PropertySearchEngine;

  beforeEach(() => {
    propertySearchEngine = PropertySearchEngine.getInstance(mockApp);
  });

  test('should initialize and find property keys', async () => {
    await propertySearchEngine.initialize();
    
    console.log(`Indexed ${propertySearchEngine.getPropertyCount()} property keys`);
    
    expect(propertySearchEngine.isReady()).toBe(true);
    expect(propertySearchEngine.getPropertyCount()).toBeGreaterThan(0);
    expect(propertySearchEngine.getPropertyKeys().size).toBe(4); // status, priority, tags, type
  });

  test('should search for specific property values', async () => {
    await propertySearchEngine.initialize();
    
    const results = await propertySearchEngine.searchProperties('[status:draft]');
    console.log(`Found ${results.size} files with status:draft`);
    
    expect(results.size).toBeGreaterThan(0);
    expect(results.size).toBeLessThanOrEqual(10); // Should be roughly half of files with properties
  });

  test('should handle key-only searches', async () => {
    await propertySearchEngine.initialize();
    
    const results = await propertySearchEngine.searchProperties('[priority]');
    console.log(`Found ${results.size} files with priority property`);
    
    expect(results.size).toBeGreaterThan(0);
    expect(results.size).toBeGreaterThan(5); // Most files should have priority
  });

  test('should handle array property searches', async () => {
    await propertySearchEngine.initialize();
    
    const results = await propertySearchEngine.searchProperties('[tags:work]');
    expect(results.size).toBeGreaterThan(0);
  });

  test('should get files with property key', async () => {
    await propertySearchEngine.initialize();
    
    const files = propertySearchEngine.getFilesWithPropertyKey('status');
    console.log(`Found ${files.size} files with status property`);
    
    expect(files.size).toBeGreaterThan(0);
  });

  test('should get files with specific property value', async () => {
    await propertySearchEngine.initialize();
    
    const files = propertySearchEngine.getFilesWithProperty('status', 'draft');
    console.log(`Found ${files.size} files with status:draft`);
    
    expect(files.size).toBeGreaterThan(0);
  });

  test('should handle invalid queries gracefully', async () => {
    await propertySearchEngine.initialize();
    
    const results = await propertySearchEngine.searchProperties('[invalid:query');
    expect(results.size).toBe(0);
  });

  test('should handle file invalidation', async () => {
    await propertySearchEngine.initialize();
    
    const initialCount = propertySearchEngine.getFileCountForProperty('status');
    const mockFile = createMockFile(21);
    
    propertySearchEngine.invalidateFile(mockFile);
    
    // After invalidation, the property count should remain the same (no rebuild in this simple test)
    const newCount = propertySearchEngine.getFileCountForProperty('status');
    expect(newCount).toBe(initialCount);
  });
});