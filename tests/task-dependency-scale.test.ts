import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import type { StructuralEntry } from '../src/types/task-structure';
import { createBaseTask, createTestKeywordManager } from './helpers/test-helper';

/**
 * Regression guard for the Org checkbox sweep. The old implementation
 * visited every task for every Org parent; this fixture has 10k parents and
 * 10k checkbox entries, so it is a direct cross-product trap.
 */
describe('dependency structural scale', () => {
  it(
    'handles 10k Org parents with 10k entry checkboxes in one rebuild',
    () => {
      const tasks = [];
      const entries: StructuralEntry[] = [];
      for (let i = 0; i < 10_000; i++) {
        const line = i * 2;
        tasks.push(
          createBaseTask({
            path: 'scale.org',
            line,
            rawText: `* TODO Parent ${i}`,
            text: `Parent ${i}`,
            state: 'TODO',
            sourceFormat: 'org',
            quoteNestingLevel: 1,
          }),
        );
        entries.push({
          kind: 'checkbox',
          path: 'scale.org',
          line: line + 1,
          indent: '  ',
          indentLength: 2,
          quotePrefix: '',
          checked: false,
        });
      }

      const state = new TaskStateManager(createTestKeywordManager());
      state.setTasks(tasks);
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: true }),
        getStructureEntries: () => new Map([['scale.org', entries]]),
        getStructureRevision: () => 1,
      });

      expect(engine.isBlocked('scale.org:0')).toBe(true);
      expect(engine.isBlocked('scale.org:19998')).toBe(true);
      expect(engine.getSnapshot().blocked.size).toBe(10_000);
    },
    30_000,
  );
});
