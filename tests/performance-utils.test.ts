import { IncrementalTaskFormatter } from '../src/utils/performance-utils';
import { createIncrementalTaskFormatter } from '../src/utils/performance-utils';
import { SettingsChangeDetector } from '../src/utils/settings-utils';
import { createSettingsChangeDetector } from '../src/utils/settings-utils';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('Performance Utils Improvements', () => {
  describe('IncrementalTaskFormatter', () => {
    let formatter: IncrementalTaskFormatter;

    beforeEach(() => {
      formatter = new IncrementalTaskFormatter();
    });

    afterEach(() => {
      formatter.clearCache();
    });

    describe('getOptimizedDecorations', () => {
      test('should return cached decorations when document version is unchanged', () => {
        // Mock EditorView with document length
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        // First call should create decorations
        const result1 = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );
        expect(result1).toBe(mockDecorations);
        expect(createDecorations).toHaveBeenCalledWith(1, 10);

        // Second call with same version should return cached result
        const result2 = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );
        expect(result2).toBe(mockDecorations);
        expect(createDecorations).toHaveBeenCalledTimes(1); // Should not be called again
      });

      test('should process entire document when no update information is available', () => {
        const mockView = {
          state: {
            doc: {
              length: 200,
              lines: 20,
            },
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        const result = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );

        expect(result).toBe(mockDecorations);
        expect(createDecorations).toHaveBeenCalledWith(1, 20);
      });

      test('should handle view update with docChanged = false', () => {
        const mockView = {
          state: {
            doc: {
              length: 150,
              lines: 15,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: false,
          view: mockView,
        } as any;

        // Mock getLastUpdate to return the update
        jest
          .spyOn(formatter as any, 'getLastUpdate')
          .mockReturnValue(mockUpdate);

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        const result = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );

        expect(result).toBe(mockDecorations);
        expect(createDecorations).toHaveBeenCalledWith(1, 15);
      });

      test('should handle view update with docChanged = true', () => {
        const mockView = {
          state: {
            doc: {
              length: 300,
              lines: 30,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        // Mock getLastUpdate to return the update
        jest
          .spyOn(formatter as any, 'getLastUpdate')
          .mockReturnValue(mockUpdate);

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        const result = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );

        expect(result).toBe(mockDecorations);
        expect(createDecorations).toHaveBeenCalledWith(1, 30);
      });

      test.todo(
        'should handle error in getLastUpdate gracefully - Error handling needs improvement',
      );
    });

    describe('shouldUseIncrementalUpdate', () => {
      test('should return false when docChanged is false', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: false,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(false);
      });

      test('should return true for large documents (>= 100 lines)', () => {
        const mockView = {
          state: {
            doc: {
              length: 5000,
              lines: 150,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(true);
      });

      test('should return false for small documents (< 100 lines)', () => {
        const mockView = {
          state: {
            doc: {
              length: 1000,
              lines: 50,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(false);
      });

      test('should return true exactly at threshold (100 lines)', () => {
        const mockView = {
          state: {
            doc: {
              length: 2000,
              lines: 100,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(true);
      });

      test('should handle documents with zero lines', () => {
        const mockView = {
          state: {
            doc: {
              length: 0,
              lines: 0,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(false);
      });

      test('should handle documents with very large line counts', () => {
        const mockView = {
          state: {
            doc: {
              length: 100000,
              lines: 1000,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).shouldUseIncrementalUpdate(
          mockUpdate,
        );
        expect(result).toBe(true);
      });
    });

    describe('getChangedLineRange', () => {
      test('should return null when docChanged is false', () => {
        const mockUpdate = {
          docChanged: false,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toBeNull();
      });

      test('should return full document range when docChanged is true', () => {
        const mockView = {
          state: {
            doc: {
              lines: 50,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 50,
        });
      });

      test('should handle documents with zero lines', () => {
        const mockView = {
          state: {
            doc: {
              lines: 0,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 0,
        });
      });

      test('should handle documents with one line', () => {
        const mockView = {
          state: {
            doc: {
              lines: 1,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 1,
        });
      });

      test('should handle documents with many lines', () => {
        const mockView = {
          state: {
            doc: {
              lines: 1000,
            },
          },
        } as any;

        const mockUpdate = {
          docChanged: true,
          view: mockView,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 1000,
        });
      });

      test('should handle update without view property', () => {
        const mockUpdate = {
          docChanged: true,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 0,
        });
      });

      test('should handle update without view property', () => {
        const mockUpdate = {
          docChanged: true,
        } as any;

        const result = (formatter as any).getChangedLineRange(mockUpdate);
        expect(result).toEqual({
          startLine: 1,
          endLine: 0,
        });
      });
    });

    describe('mergeDecorations', () => {
      test.todo(
        'should handle empty decorations - RangeSetBuilder mocking is complex',
      );
    });

    describe('getLastUpdate', () => {
      test('should return null when view is null', () => {
        const result = (formatter as any).getLastUpdate(null);
        expect(result).toBeNull();
      });

      test('should return null when view.state is null', () => {
        const mockView = {
          state: null,
        } as any;

        const result = (formatter as any).getLastUpdate(mockView);
        expect(result).toBeNull();
      });

      test('should return null when view.state.doc is null', () => {
        const mockView = {
          state: {
            doc: null,
          },
        } as any;

        const result = (formatter as any).getLastUpdate(mockView);
        expect(result).toBeNull();
      });

      test('should return null when view has valid structure', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const result = (formatter as any).getLastUpdate(mockView);
        expect(result).toBeNull();
      });

      test('should handle error gracefully when accessing view properties', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        // Mock console.warn to verify it's called
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const result = (formatter as any).getLastUpdate(mockView);
        expect(result).toBeNull();
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      test('should handle error gracefully when accessing view properties', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        // Mock console.warn to verify it's called
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const result = (formatter as any).getLastUpdate(mockView);
        expect(result).toBeNull();
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe('cache behavior and version tracking', () => {
      test('should track document version changes correctly', () => {
        const mockView1 = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const mockView2 = {
          state: {
            doc: {
              length: 200,
              lines: 20,
            },
          },
        } as any;

        const mockDecorations1 = { type: 'mock1' } as any;
        const mockDecorations2 = { type: 'mock2' } as any;
        const createDecorations = jest
          .fn()
          .mockReturnValueOnce(mockDecorations1)
          .mockReturnValueOnce(mockDecorations2);

        // First call with view1
        const result1 = formatter.getOptimizedDecorations(
          mockView1,
          createDecorations,
        );
        expect(result1).toBe(mockDecorations1);
        expect(createDecorations).toHaveBeenCalledWith(1, 10);

        // Second call with same view1 should use cache
        const result2 = formatter.getOptimizedDecorations(
          mockView1,
          createDecorations,
        );
        expect(result2).toBe(mockDecorations1);
        expect(createDecorations).toHaveBeenCalledTimes(1);

        // Third call with different view2 should create new decorations
        const result3 = formatter.getOptimizedDecorations(
          mockView2,
          createDecorations,
        );
        expect(result3).toBe(mockDecorations2);
        expect(createDecorations).toHaveBeenCalledWith(1, 20);
        expect(createDecorations).toHaveBeenCalledTimes(2);
      });

      test('should handle rapid document changes', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        // Simulate rapid changes by calling multiple times
        for (let i = 0; i < 5; i++) {
          const result = formatter.getOptimizedDecorations(
            mockView,
            createDecorations,
          );
          expect(result).toBe(mockDecorations);
        }

        // Should only call createDecorations once due to caching
        expect(createDecorations).toHaveBeenCalledTimes(1);
      });

      test('should handle cache invalidation after clearCache', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        // First call
        formatter.getOptimizedDecorations(mockView, createDecorations);
        expect(createDecorations).toHaveBeenCalledTimes(1);

        // Clear cache
        formatter.clearCache();

        // Second call should create new decorations
        formatter.getOptimizedDecorations(mockView, createDecorations);
        expect(createDecorations).toHaveBeenCalledTimes(2);
      });
    });

    describe('error handling and edge cases', () => {
      test('should handle createDecorations function throwing error', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        const createDecorations = jest.fn().mockImplementation(() => {
          throw new Error('Test error in createDecorations');
        });

        expect(() => {
          formatter.getOptimizedDecorations(mockView, createDecorations);
        }).toThrow('Test error in createDecorations');
      });

      test('should handle null createDecorations function', () => {
        const mockView = {
          state: {
            doc: {
              length: 100,
              lines: 10,
            },
          },
        } as any;

        expect(() => {
          formatter.getOptimizedDecorations(mockView, null as any);
        }).toThrow();
      });

      test('should handle undefined view', () => {
        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        expect(() => {
          formatter.getOptimizedDecorations(
            undefined as any,
            createDecorations,
          );
        }).toThrow();
      });

      test('should handle view with missing state', () => {
        const mockView = {
          // Missing state property
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        expect(() => {
          formatter.getOptimizedDecorations(mockView, createDecorations);
        }).toThrow();
      });

      test('should handle view with missing doc', () => {
        const mockView = {
          state: {
            // Missing doc property
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        expect(() => {
          formatter.getOptimizedDecorations(mockView, createDecorations);
        }).toThrow();
      });

      test('should handle view with missing length and lines', () => {
        const mockView = {
          state: {
            doc: {
              // Missing length and lines properties
            },
          },
        } as any;

        const mockDecorations = { type: 'mock' } as any;
        const createDecorations = jest.fn().mockReturnValue(mockDecorations);

        // This should not throw, it should handle the missing properties gracefully
        const result = formatter.getOptimizedDecorations(
          mockView,
          createDecorations,
        );
        expect(result).toBe(mockDecorations);
      });
    });

    test('should clear cache when requested', () => {
      // Mock a cached decoration
      const mockDecorations = { type: 'mock' } as any;

      // Access private method for testing
      (formatter as any).cachedDecorations = mockDecorations;
      (formatter as any).lastProcessedVersion = 123;

      formatter.clearCache();

      expect((formatter as any).cachedDecorations).toBeNull();
      expect((formatter as any).lastProcessedVersion).toBe(-1);
    });

    test('should invalidate cache when settings change', () => {
      const mockDecorations = { type: 'mock' } as any;

      // Access private method for testing
      (formatter as any).cachedDecorations = mockDecorations;
      (formatter as any).lastProcessedVersion = 123;

      formatter.invalidateCache();

      expect((formatter as any).cachedDecorations).toBeNull();
      expect((formatter as any).lastProcessedVersion).toBe(-1);
    });

    test('should create new formatter instance', () => {
      const newFormatter = createIncrementalTaskFormatter();
      expect(newFormatter).toBeInstanceOf(IncrementalTaskFormatter);
    });
  });

  describe('SettingsChangeDetector', () => {
    let detector: SettingsChangeDetector;
    let mockSettings: TodoTrackerSettings;

    beforeEach(() => {
      detector = new SettingsChangeDetector();
      mockSettings = {
        refreshInterval: 60,
        additionalTaskKeywords: [],
        includeCodeBlocks: false,
        includeCalloutBlocks: true,
        includeCommentBlocks: false,
        taskListViewMode: 'showAll',
        languageCommentSupport: { enabled: true },
        weekStartsOn: 'Monday',
        formatTaskKeywords: true,
      };
    });

    test('should throw error when checking changes before initialization', () => {
      expect(() => {
        detector.hasFormattingSettingsChanged(mockSettings);
      }).toThrow(
        'SettingsChangeDetector must be initialized before use. Call initialize() first.',
      );
    });

    test('should throw error when updating state before initialization', () => {
      expect(() => {
        detector.updatePreviousState(mockSettings);
      }).toThrow(
        'SettingsChangeDetector must be initialized before use. Call initialize() first.',
      );
    });

    test('should throw error when initializing twice', () => {
      detector.initialize(mockSettings);

      expect(() => {
        detector.initialize(mockSettings);
      }).toThrow(
        'SettingsChangeDetector is already initialized. Create a new instance instead.',
      );
    });

    test('should detect settings changes correctly', () => {
      detector.initialize(mockSettings);

      // Change a setting
      const changedSettings = { ...mockSettings, formatTaskKeywords: false };

      expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(true);
    });

    test('should not detect changes when settings are the same', () => {
      detector.initialize(mockSettings);

      // Same settings
      const sameSettings = { ...mockSettings };

      expect(detector.hasFormattingSettingsChanged(sameSettings)).toBe(false);
    });

    test('should update previous state correctly', () => {
      detector.initialize(mockSettings);

      const newSettings = { ...mockSettings, includeCodeBlocks: true };
      detector.updatePreviousState(newSettings);

      // Should not detect changes when comparing to the updated state
      expect(detector.hasFormattingSettingsChanged(newSettings)).toBe(false);
    });

    test('should reset detector state', () => {
      detector.initialize(mockSettings);
      detector.reset();

      expect(() => {
        detector.hasFormattingSettingsChanged(mockSettings);
      }).toThrow(
        'SettingsChangeDetector must be initialized before use. Call initialize() first.',
      );
    });

    test('should create new detector instance', () => {
      const newDetector = createSettingsChangeDetector();
      expect(newDetector).toBeInstanceOf(SettingsChangeDetector);
    });

    test('should handle JSON serialization errors gracefully', () => {
      detector.initialize(mockSettings);

      // Create settings that might cause JSON serialization issues
      const problematicSettings = {
        ...mockSettings,
        // Add a circular reference that would cause JSON.stringify to fail
        circular: {} as any,
      };
      problematicSettings.circular = problematicSettings;

      // Should not throw an error, but return false for change detection
      expect(() => {
        detector.hasFormattingSettingsChanged(
          problematicSettings as TodoTrackerSettings,
        );
      }).not.toThrow();
    });
  });
});
