import { PropertySearchEngine } from '../src/services/property-search-engine';
import { App, TFile } from 'obsidian';

// Create mock file objects
const createMockFile = (index: number): TFile => ({
  path: `file-${index}.md`,
  name: `file-${index}.md`,
  basename: `file-${index}`,
  extension: 'md',
  stat: { size: 1024, mtime: Date.now() },
} as TFile);

// Mock the Obsidian app
const mockApp = {
  vault: {
    getMarkdownFiles: () => {
      // Simulate a large vault with 1000 files
      const files = [];
      for (let i = 0; i < 1000; i++) {
        files.push(createMockFile(i));
      }
      return files;
    },
  },
  metadataCache: {
    getFileCache: (file: TFile) => {
      // Simulate files with different properties
      const fileNum = parseInt(file.name.replace('.md', ''));
      const frontmatter: any = {};
      
      // Add properties to about 20% of files
      if (fileNum % 5 === 0) frontmatter.status = 'draft';
      if (fileNum % 7 === 0) frontmatter.priority = 'high';
      if (fileNum % 11 === 0) frontmatter.tags = ['work', 'urgent'];
      if (fileNum % 13 === 0) frontmatter.due = '2023-12-31';
      if (fileNum % 17 === 0) frontmatter.type = 'task';
      
      return Object.keys(frontmatter).length > 0 ? { frontmatter } : null;
    },
    getAllPropertyInfos: () => {
      // Simulate known property types
      return {
        status: { type: 'string' },
        priority: { type: 'string' },
        tags: { type: 'array' },
        due: { type: 'date' },
        type: { type: 'string' },
      };
    },
    on: jest.fn(),
  },
} as unknown as App;

describe('PropertySearchEngine Performance', () => {
  let propertySearchEngine: PropertySearchEngine;

  beforeEach(() => {
    propertySearchEngine = PropertySearchEngine.getInstance(mockApp);
  });

  test('should handle file invalidation efficiently', async () => {
    await propertySearchEngine.initialize();
    
    // Get initial count
    const initialCount = propertySearchEngine.getFileCountForProperty('status');
    
    // Simulate file change
    const mockFile = createMockFile(1);
    
    const startTime = Date.now();
    propertySearchEngine.invalidateFile(mockFile);
    const endTime = Date.now();
    
    console.log(`File invalidation took ${endTime - startTime}ms`);
    
    expect(endTime - startTime).toBeLessThan(50); // Should be very fast (< 50ms)
  });

  test('should startup scan with delay', async () => {
    const testSettings = {
      runStartupScan: true,
      startupScanDelay: 100, // 100ms delay for testing
      showStartupScanProgress: true,
    };
    
    const startTime = Date.now();
    await propertySearchEngine.initializeStartupScan(testSettings);
    
    // Wait for the delayed startup scan to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const endTime = Date.now();
    console.log(`Startup scan with delay took ${endTime - startTime}ms`);
    
    expect(propertySearchEngine.isReady()).toBe(true);
  });
});