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

    it('should exclude priority tags #A, #B, #C from tag suggestions', () => {
      // Create mock tasks with priority tags
      const mockTasksWithPriority: Task[] = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO high priority task #A #urgent',
          indent: '',
          listMarker: '-',
          text: 'high priority task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: 'TODO medium priority task #B #work',
          indent: '',
          listMarker: '-',
          text: 'medium priority task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 3,
          rawText: 'TODO low priority task #C #personal',
          indent: '',
          listMarker: '-',
          text: 'low priority task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];
      
      const allTags = SearchSuggestions.getAllTags(mockTasksWithPriority);
      
      // Should not include priority tags A, B, C
      expect(allTags).not.toContain('A');
      expect(allTags).not.toContain('B');
      expect(allTags).not.toContain('C');
      
      // Should include regular tags
      expect(allTags).toContain('urgent');
      expect(allTags).toContain('work');
      expect(allTags).toContain('personal');
      
      // Should have exactly 3 tags (urgent, work, personal)
      expect(allTags.length).toBe(3);
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

  describe('Path extraction methods', () => {
    it('should extract paths from tasks correctly', () => {
      const tasks = [
        {
          path: 'notes/journal/meeting.md',
          line: 1,
          rawText: 'TODO meeting',
          indent: '',
          listMarker: '-',
          text: 'meeting',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/work/tasks.md',
          line: 2,
          rawText: 'TODO work task',
          indent: '',
          listMarker: '-',
          text: 'work task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const paths = SearchSuggestions.getAllPathsFromTasks(tasks);
      
      // Should extract parent directories
      expect(paths).toContain('notes');
      expect(paths).toContain('notes/journal');
      expect(paths).toContain('notes/work');
      
      // Should be sorted alphabetically
      expect(paths).toEqual(['notes', 'notes/journal', 'notes/work']);
    });

    it('should handle empty task array', () => {
      const paths = SearchSuggestions.getAllPathsFromTasks([]);
      expect(paths).toEqual([]);
    });

    it('should handle tasks with single-level paths', () => {
      const tasks = [
        {
          path: 'file.md',
          line: 1,
          rawText: 'TODO task',
          indent: '',
          listMarker: '-',
          text: 'task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const paths = SearchSuggestions.getAllPathsFromTasks(tasks);
      expect(paths).toEqual([]); // No parent directories for single-level paths
    });

    it('should generate paths from vault dynamically', async () => {
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'notes/journal/meeting.md' },
            { path: 'notes/work/tasks.md' },
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      // Each call should generate fresh data
      const paths1 = await SearchSuggestions.getAllPaths(mockVault);
      expect(paths1).toContain('notes');
      expect(paths1).toContain('notes/journal');
      expect(paths1).toContain('notes/work');
      
      // Second call should generate the same data (since vault hasn't changed)
      const paths2 = await SearchSuggestions.getAllPaths(mockVault);
      expect(paths2).toEqual(paths1);
    });

    it('should generate files from vault dynamically', async () => {
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'notes/test.md', name: 'test.md' },
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      // Each call should generate fresh data
      const files1 = await SearchSuggestions.getAllFiles(mockVault);
      expect(files1).toContain('test.md');
      
      // Second call should generate the same data (since vault hasn't changed)
      const files2 = await SearchSuggestions.getAllFiles(mockVault);
      expect(files2).toEqual(files1);
    });
  });

  describe('File extraction methods', () => {
    it('should extract filenames from tasks correctly', () => {
      const tasks = [
        {
          path: 'notes/journal/meeting.md',
          line: 1,
          rawText: 'TODO meeting',
          indent: '',
          listMarker: '-',
          text: 'meeting',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/work/tasks.md',
          line: 2,
          rawText: 'TODO work task',
          indent: '',
          listMarker: '-',
          text: 'work task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/journal/meeting.md', // Duplicate filename
          line: 3,
          rawText: 'TODO another meeting',
          indent: '',
          listMarker: '-',
          text: 'another meeting',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const files = SearchSuggestions.getAllFilesFromTasks(tasks);
      
      // Should extract unique filenames
      expect(files).toContain('meeting.md');
      expect(files).toContain('tasks.md');
      
      // Should be sorted alphabetically
      expect(files).toEqual(['meeting.md', 'tasks.md']);
    });

    it('should handle empty task array for files', () => {
      const files = SearchSuggestions.getAllFilesFromTasks([]);
      expect(files).toEqual([]);
    });

    it('should extract filenames from vault correctly', async () => {
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'notes/journal/meeting.md', name: 'meeting.md' },
            { path: 'notes/work/tasks.md', name: 'tasks.md' },
            { path: 'notes/journal/notes.md', name: 'notes.md' },
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      const files = await SearchSuggestions.getAllFiles(mockVault);
      
      // Should extract unique filenames
      expect(files).toContain('meeting.md');
      expect(files).toContain('tasks.md');
      expect(files).toContain('notes.md');
      
      // Should be sorted alphabetically
      expect(files).toEqual(['meeting.md', 'notes.md', 'tasks.md']);
    });

    it('should generate files from vault dynamically', async () => {
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'notes/test.md', name: 'test.md' },
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      // Each call should generate fresh data
      const files1 = await SearchSuggestions.getAllFiles(mockVault);
      expect(files1).toContain('test.md');
      
      // Second call should generate the same data (since vault hasn't changed)
      const files2 = await SearchSuggestions.getAllFiles(mockVault);
      expect(files2).toEqual(files1);
    });
  });

  describe('State and priority methods', () => {
    it('should return default task states', () => {
      const states = SearchSuggestions.getAllStates();
      
      // Should contain default states
      expect(states).toContain('TODO');
      expect(states).toContain('DOING');
      expect(states).toContain('DONE');
      expect(states).toContain('NOW');
      expect(states).toContain('LATER');
      expect(states).toContain('WAIT');
      expect(states).toContain('WAITING');
      expect(states).toContain('IN-PROGRESS');
      expect(states).toContain('CANCELED');
      expect(states).toContain('CANCELLED');
      
      // Should be sorted alphabetically
      expect(states).toEqual(['CANCELED', 'CANCELLED', 'DOING', 'DONE', 'IN-PROGRESS', 'LATER', 'NOW', 'TODO', 'WAIT', 'WAITING']);
    });

    it('should return priority options', () => {
      const priorities = SearchSuggestions.getPriorityOptions();
      
      expect(priorities).toEqual(['A', 'B', 'C', 'high', 'medium', 'low', 'none']);
    });

    it('should return date suggestions', () => {
      const dateSuggestions = SearchSuggestions.getDateSuggestions();
      
      expect(dateSuggestions).toEqual(['overdue', 'due', 'today', 'tomorrow', 'this week', 'next week', 'this month', 'next month', 'next 7 days', 'none']);
    });
  });

  describe('Date extraction methods', () => {
    it('should extract scheduled dates from tasks', () => {
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task with scheduled date',
          indent: '',
          listMarker: '-',
          text: 'task with scheduled date',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date('2023-01-15T00:00:00Z'),
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: 'TODO task with different scheduled date',
          indent: '',
          listMarker: '-',
          text: 'task with different scheduled date',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date('2023-02-20T00:00:00Z'),
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 3,
          rawText: 'TODO task without scheduled date',
          indent: '',
          listMarker: '-',
          text: 'task without scheduled date',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const dates = SearchSuggestions.getScheduledDateSuggestions(tasks);
      
      // Should extract unique dates in YYYY-MM-DD format
      expect(dates).toContain('2023-01-15');
      expect(dates).toContain('2023-02-20');
      
      // Should be sorted chronologically
      expect(dates).toEqual(['2023-01-15', '2023-02-20']);
    });

    it('should handle empty task array for scheduled dates', () => {
      const dates = SearchSuggestions.getScheduledDateSuggestions([]);
      expect(dates).toEqual([]);
    });

    it('should extract deadline dates from tasks', () => {
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task with deadline',
          indent: '',
          listMarker: '-',
          text: 'task with deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date('2023-03-10T00:00:00Z')
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: 'TODO task with different deadline',
          indent: '',
          listMarker: '-',
          text: 'task with different deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date('2023-04-05T00:00:00Z')
        }
      ];

      const dates = SearchSuggestions.getDeadlineDateSuggestions(tasks);
      
      // Should extract unique dates in YYYY-MM-DD format
      expect(dates).toContain('2023-03-10');
      expect(dates).toContain('2023-04-05');
      
      // Should be sorted chronologically
      expect(dates).toEqual(['2023-03-10', '2023-04-05']);
    });

    it('should handle empty task array for deadline dates', () => {
      const dates = SearchSuggestions.getDeadlineDateSuggestions([]);
      expect(dates).toEqual([]);
    });

    it('should handle tasks with same scheduled date', () => {
      const date = new Date('2023-01-15T00:00:00Z');
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task 1',
          indent: '',
          listMarker: '-',
          text: 'task 1',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: 'TODO task 2',
          indent: '',
          listMarker: '-',
          text: 'task 2',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date, // Same date
          deadlineDate: null
        }
      ];

      const dates = SearchSuggestions.getScheduledDateSuggestions(tasks);
      
      // Should deduplicate same dates
      expect(dates).toEqual(['2023-01-15']);
    });

    it('should handle tasks with no deadline dates', () => {
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task without deadline',
          indent: '',
          listMarker: '-',
          text: 'task without deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const dates = SearchSuggestions.getDeadlineDateSuggestions(tasks);
      expect(dates).toEqual([]);
    });
  });

  describe('Edge case coverage', () => {
    it('should handle files with single-level paths in vault', async () => {
      // Clear cache first
      SearchSuggestions.clearCache();
      
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'file1.md', name: 'file1.md' },
            { path: 'file2.md', name: 'file2.md' }
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      const paths = await SearchSuggestions.getAllPaths(mockVault);
      // Should return empty array for single-level paths (no parent directories)
      expect(paths).toEqual([]);
    });

    it('should handle duplicate filenames in vault', async () => {
      // Clear cache first
      SearchSuggestions.clearCache();
      
      class MockVault implements Partial<Vault> {
        getMarkdownFiles() {
          return [
            { path: 'notes/file.md', name: 'file.md' },
            { path: 'work/file.md', name: 'file.md' } // Same filename, different path
          ] as any;
        }
      }
      
      const mockVault = new MockVault() as Vault;
      
      const files = await SearchSuggestions.getAllFiles(mockVault);
      // Should deduplicate filenames
      expect(files).toEqual(['file.md']);
    });

    it('should handle tasks with no deadline dates mixed with tasks that have deadlines', () => {
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task with deadline',
          indent: '',
          listMarker: '-',
          text: 'task with deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date('2023-03-10T00:00:00Z')
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: 'TODO task without deadline',
          indent: '',
          listMarker: '-',
          text: 'task without deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 3,
          rawText: 'TODO another task with deadline',
          indent: '',
          listMarker: '-',
          text: 'another task with deadline',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date('2023-04-05T00:00:00Z')
        }
      ];

      const dates = SearchSuggestions.getDeadlineDateSuggestions(tasks);
      
      // Should only include dates from tasks that have deadlines
      expect(dates).toContain('2023-03-10');
      expect(dates).toContain('2023-04-05');
      expect(dates).toEqual(['2023-03-10', '2023-04-05']);
    });

    it('should handle tasks with missing rawText property', () => {
      const tasks = [
        {
          path: 'notes/tasks.md',
          line: 1,
          rawText: 'TODO task with tags #urgent #work',
          indent: '',
          listMarker: '-',
          text: 'task with tags',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        },
        {
          path: 'notes/tasks.md',
          line: 2,
          rawText: undefined, // Missing rawText
          indent: '',
          listMarker: '-',
          text: 'task without rawText',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null
        }
      ];

      const tags = SearchSuggestions.getAllTags(tasks);
      
      // Should only extract tags from tasks that have rawText
      expect(tags).toContain('urgent');
      expect(tags).toContain('work');
      expect(tags).toEqual(['urgent', 'work']);
    });
  });
});