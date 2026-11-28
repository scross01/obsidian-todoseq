import {
  BlockingDensity,
  BlockingFixture,
  createBlockingFixture,
} from '../scripts/perf/blocking-fixture';
import { FIXED_TODAY } from '../scripts/perf/generate-fixture';
import { TaskParser } from '../src/parser/task-parser';
import { CodeCommentTaskParser } from '../src/parser/code-comment-task-parser';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

function parseVault(fixture: BlockingFixture): Task[] {
  const settings = createBaseSettings({
    scanCodeFiles: true,
    detectOrgModeFiles: true,
  });
  const keywordManager = createTestKeywordManager(settings);
  const mdParser = TaskParser.create(keywordManager, null, undefined, {
    includeCalloutBlocks: true,
    includeCodeBlocks: true,
    includeCommentBlocks: true,
  });
  const codeParser = CodeCommentTaskParser.create(keywordManager);
  const orgParser = OrgModeTaskParser.create(keywordManager, null);

  const tasks: Task[] = [];
  for (const file of fixture.files) {
    if (file.path.endsWith('.md')) {
      tasks.push(...mdParser.parseFile(file.content, file.path));
    } else if (file.path.endsWith('.org')) {
      tasks.push(...orgParser.parseFile(file.content, file.path));
    } else {
      tasks.push(...codeParser.parseFile(file.content, file.path));
    }
  }
  return tasks;
}

const EXACT_COUNTS: Record<
  'm' | 'l',
  Record<'occasional' | 'heavy', [number, number, number]>
> = {
  m: {
    occasional: [180, 269, 89],
    heavy: [1800, 6659, 899],
  },
  l: {
    occasional: [700, 1049, 349],
    heavy: [7000, 25899, 3499],
  },
};

describe('blocking perf fixture', () => {
  it('is deterministic for the same seed and date, and the seed changes the files', () => {
    const a = createBlockingFixture('s', 'heavy', 1337, FIXED_TODAY);
    const b = createBlockingFixture('s', 'heavy', 1337, FIXED_TODAY);
    expect(JSON.stringify(a.files)).toBe(JSON.stringify(b.files));
    expect(a).toMatchObject({
      drawerCount: b.drawerCount,
      propertyCount: b.propertyCount,
      blockerCount: b.blockerCount,
    });

    const other = createBlockingFixture('s', 'heavy', 1338, FIXED_TODAY);
    expect(JSON.stringify(other.files)).not.toBe(JSON.stringify(a.files));
  });

  it('keeps baseline empty and pins the exact occasional/heavy counts', () => {
    const baseline = createBlockingFixture('s', 'baseline');
    expect(baseline).toMatchObject({
      drawerCount: 0,
      propertyCount: 0,
      blockerCount: 0,
    });

    for (const size of ['m', 'l'] as const) {
      for (const density of ['occasional', 'heavy'] as const) {
        const fixture = createBlockingFixture(size, density);
        expect([
          fixture.drawerCount,
          fixture.propertyCount,
          fixture.blockerCount,
        ]).toEqual(EXACT_COUNTS[size][density]);

        const ordered = density === 'heavy' ? fixture.drawerCount / 5 : 0;
        const extraUnknown = density === 'heavy' ? fixture.drawerCount * 2 : 0;
        expect(fixture.propertyCount).toBe(
          fixture.drawerCount + extraUnknown + fixture.blockerCount + ordered,
        );
      }
    }
  });

  it('never inserts a drawer after a table-cell line', () => {
    const fixture = createBlockingFixture('m', 'heavy');
    for (const file of fixture.files) {
      if (!file.path.endsWith('.md')) continue;
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/^[ \t]*\|/.test(lines[i])) continue;
        expect(lines[i + 1] ?? '').not.toContain(':PROPERTIES:');
      }
    }
  });

  it.each(['m', 'l'] as const)(
    'parses back every task and property count at size %s',
    (size) => {
      for (const density of [
        'baseline',
        'occasional',
        'heavy',
      ] as BlockingDensity[]) {
        const fixture = createBlockingFixture(size, density);
        const tasks = parseVault(fixture);

        expect(tasks.length).toBe(fixture.taskCount);
        expect(tasks.filter((task) => task.id !== undefined).length).toBe(
          fixture.drawerCount,
        );
        expect(
          tasks.filter((task) => (task.blockedBy?.length ?? 0) > 0).length,
        ).toBe(fixture.blockerCount);
      }
    },
  );
});
