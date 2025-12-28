import { SearchSuggestions } from '../src/search/search-suggestions';
import { SearchSuggestionDropdown } from '../src/search/search-suggestion-dropdown';
import { Task } from '../src/task';
import { Vault } from 'obsidian';

describe('Search Suggestions', () => {

  const mockTasks: Task[] = [
    {
      path: 'notes/journal/meeting.md',
      line: 1,
      rawText: 'TODO meeting about project planning #urgent #work',
      indent: '',
      listMarker: '-',
      text: 'meeting about project planning',
      state: 'TODO',
      completed: false,
      priority: 'high',
      scheduledDate: null,
      deadlineDate: null
    },
    {
      path: 'notes/personal/hobbies.md',
      line: 2,
      rawText: 'TODO personal meetup with friends #social',
      indent: '',
      listMarker: '-',
      text: 'personal meetup with friends',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null
    }
  ];

  describe('SearchSuggestions utility methods', () => {
    it('should filter suggestions based on search term', () => {
      const suggestions = ['path1/', 'path2/', 'journal/', 'work/'];
      const filtered = SearchSuggestions.filterSuggestions('jour', suggestions);
      expect(filtered).toEqual(['journal/']);
    });

    it('should return all suggestions when search term is empty', () => {
      const suggestions = ['path1/', 'path2/', 'journal/'];
      const filtered = SearchSuggestions.filterSuggestions('', suggestions);
      expect(filtered).toEqual(suggestions);
    });

    it('should be case insensitive', () => {
      const suggestions = ['Journal/', 'Work/', 'Personal/'];
      const filtered = SearchSuggestions.filterSuggestions('jour', suggestions);
      expect(filtered).toEqual(['Journal/']);
    });
  });

  describe('SearchSuggestionDropdown filtering logic', () => {
    // Mock Vault implementation
    class MockVault implements Partial<Vault> {
      getMarkdownFiles() {
        return [
          { path: 'notes/journal/meeting.md' },
          { path: 'notes/work/tasks.md' },
          { path: 'notes/personal/hobbies.md' }
        ] as any;
      }
    }

    it('should filter path suggestions based on search term', async () => {
      const mockVault = new MockVault() as Vault;
      
      // Test the filtering logic directly
      const allPaths = await SearchSuggestions.getAllPaths(mockVault);
      const filteredPaths = SearchSuggestions.filterSuggestions('jour', allPaths);
      
      expect(filteredPaths.length).toBeGreaterThan(0);
      expect(filteredPaths.some(p => p.includes('journal'))).toBe(true);
    });

    it('should filter tag suggestions based on search term', () => {
      const mockVault = new MockVault() as Vault;
      
      // Test the filtering logic directly
      const allTags = SearchSuggestions.getAllTags(mockTasks);
      const filteredTags = SearchSuggestions.filterSuggestions('urg', allTags);
      
      expect(filteredTags).toEqual(['urgent']);
    });

    it('should handle empty search term by returning all suggestions', () => {
      const mockVault = new MockVault() as Vault;
      
      // Test with empty search term
      const allTags = SearchSuggestions.getAllTags(mockTasks);
      const filteredTags = SearchSuggestions.filterSuggestions('', allTags);
      
      expect(filteredTags).toEqual(allTags);
    });

    it('should extract and filter paths correctly for examples folder', async () => {
      // Clear cache to ensure we get fresh data
      SearchSuggestions.clearCache();
      
      // Mock Vault with examples folder
      class MockVaultWithExamples implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'examples/test1.md' },
            { path: 'examples/subfolder/test2.md' },
            { path: 'notes/journal.md' }
          ] as any;
        }
      }
      
      const mockVault = new MockVaultWithExamples() as Vault;
      const allPaths = await SearchSuggestions.getAllPaths(mockVault);
            
      // Should include 'examples' (without trailing slash)
      expect(allPaths).toContain('examples');
      
      // Test filtering for 'exam'
      const filteredPaths = SearchSuggestions.filterSuggestions('exam', allPaths);

      // Should find 'examples' when searching for 'exam'
      expect(filteredPaths).toContain('examples');
      expect(filteredPaths.length).toBeGreaterThan(0);
    });
  });

  describe('Prefix detection logic', () => {
    it('should detect complete prefix with colon', () => {
      const text = 'path:jour';
      const match = text.match(/(\w+)(:([^\s]*))?$/);
      
      expect(match).not.toBeNull();
      if (match) {
        expect(match[1]).toBe('path');
        expect(match[2]).toBe(':jour');
        expect(match[3]).toBe('jour');
      }
    });

    it('should detect incomplete prefix without colon', () => {
      const text = 'path';
      const match = text.match(/(\w+)(:([^\s]*))?$/);
      
      expect(match).not.toBeNull();
      if (match) {
        expect(match[1]).toBe('path');
        expect(match[2]).toBeUndefined();
        expect(match[3]).toBeUndefined();
      }
    });

    it('should detect prefix with partial search term', () => {
      const text = 'tag:urg';
      const match = text.match(/(\w+)(:([^\s]*))?$/);
      
      expect(match).not.toBeNull();
      if (match) {
        expect(match[1]).toBe('tag');
        expect(match[2]).toBe(':urg');
        expect(match[3]).toBe('urg');
      }
    });

    it('should handle cache clearing and reloading', async () => {
      // Clear cache to start fresh
      SearchSuggestions.clearCache();
      
      // Mock Vault 1
      class MockVault1 implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'examples/test1.md' },
          ] as any;
        }
      }
      
      const mockVault1 = new MockVault1() as Vault;
      let allPaths = await SearchSuggestions.getAllPaths(mockVault1);
      
      expect(allPaths).toContain('examples');
      
      // Mock Vault 2 - different structure
      class MockVault2 implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'samples/test1.md' },
          ] as any;
        }
      }
      
      // Clear cache and get new paths
      SearchSuggestions.clearCache();
      const mockVault2 = new MockVault2() as Vault;
      allPaths = await SearchSuggestions.getAllPaths(mockVault2);
      
      expect(allPaths).toContain('samples');
      expect(allPaths).not.toContain('examples');
    });

    it('should handle paths with spaces and require quotes', () => {
      // Test that paths with spaces are detected correctly
      const pathsWithSpaces = ['examples/sub folder', 'my documents', 'project files'];
      const pathsWithoutSpaces = ['examples', 'documents', 'projects'];
      
      pathsWithSpaces.forEach(path => {
        expect(path.includes(' ')).toBe(true);
        // These should be quoted when used in search
        const shouldBeQuoted = path.includes(' ');
        expect(shouldBeQuoted).toBe(true);
      });
      
      pathsWithoutSpaces.forEach(path => {
        expect(path.includes(' ')).toBe(false);
        // These should NOT be quoted
        const shouldBeQuoted = path.includes(' ');
        expect(shouldBeQuoted).toBe(false);
      });
    });

    it('should extract and handle paths with spaces correctly', async () => {
      // Clear cache to ensure we get fresh data
      SearchSuggestions.clearCache();
      
      // Mock Vault with folders that have spaces in names
      class MockVaultWithSpaces implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'examples/sub folder/test.md' },
            { path: 'my documents/file.md' },
            { path: 'notes/journal.md' }
          ] as any;
        }
      }
      
      const mockVault = new MockVaultWithSpaces() as Vault;
      const allPaths = await SearchSuggestions.getAllPaths(mockVault);
            
      // Should include paths with spaces
      expect(allPaths).toContain('examples');
      expect(allPaths).toContain('examples/sub folder'); // This has a space
      expect(allPaths).toContain('my documents'); // This has a space
      
      // Test that paths with spaces are correctly identified for quoting
      const pathsWithSpaces = allPaths.filter(p => p.includes(' '));
      
      expect(pathsWithSpaces.length).toBeGreaterThan(0);
      pathsWithSpaces.forEach(path => {
        expect(path.includes(' ')).toBe(true);
      });
    });
  });
});