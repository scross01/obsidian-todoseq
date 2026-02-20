import {
  buildKeywordSortConfig,
  getKeywordGroup,
} from '../src/utils/task-sort';

describe('Keyword Sort Configuration', () => {
  describe('buildKeywordSortConfig', () => {
    test('should build correct config with custom active keyword', () => {
      const config = buildKeywordSortConfig({
        activeKeywords: ['STARTED'],
        inactiveKeywords: [],
        waitingKeywords: ['ON-HOLD'],
        completedKeywords: [],
      });

      console.log('Config:', config);

      // Verify active keywords
      expect(config.activeKeywords.has('STARTED')).toBeTruthy();
      expect(config.activeKeywords.has('DOING')).toBeTruthy();
      expect(config.activeKeywordsOrder.includes('STARTED')).toBeTruthy();
      expect(config.activeKeywordsOrder.indexOf('STARTED')).toBeGreaterThan(
        config.activeKeywordsOrder.indexOf('DOING'),
      );

      // Verify waiting keywords
      expect(config.waitingKeywords.has('ON-HOLD')).toBeTruthy();
      expect(config.waitingKeywords.has('WAIT')).toBeTruthy();
      expect(config.waitingKeywordsOrder.includes('ON-HOLD')).toBeTruthy();
      expect(config.waitingKeywordsOrder.indexOf('ON-HOLD')).toBeGreaterThan(
        config.waitingKeywordsOrder.indexOf('WAIT'),
      );
    });

    test('should build correct config with multiple custom keywords in all groups', () => {
      const config = buildKeywordSortConfig({
        activeKeywords: ['STARTED', 'WORKING', 'ASSIGNED'],
        inactiveKeywords: ['PENDING', 'BACKLOG', 'DEFERRED'],
        waitingKeywords: ['ON-HOLD', 'BLOCKED', 'WAITING-ON'],
        completedKeywords: ['FINISHED', 'CLOSED', 'ARCHIVED'],
      });

      console.log('Config:', config);

      // Verify active keywords
      expect(config.activeKeywords.has('STARTED')).toBeTruthy();
      expect(config.activeKeywords.has('WORKING')).toBeTruthy();
      expect(config.activeKeywords.has('ASSIGNED')).toBeTruthy();
      expect(config.activeKeywords.has('DOING')).toBeTruthy();
      expect(config.activeKeywordsOrder.includes('STARTED')).toBeTruthy();
      expect(config.activeKeywordsOrder.indexOf('STARTED')).toBeGreaterThan(
        config.activeKeywordsOrder.indexOf('DOING'),
      );
      expect(config.activeKeywordsOrder.indexOf('WORKING')).toBeGreaterThan(
        config.activeKeywordsOrder.indexOf('STARTED'),
      );
      expect(config.activeKeywordsOrder.indexOf('ASSIGNED')).toBeGreaterThan(
        config.activeKeywordsOrder.indexOf('WORKING'),
      );

      // Verify inactive keywords
      expect(config.inactiveKeywords.has('PENDING')).toBeTruthy();
      expect(config.inactiveKeywords.has('BACKLOG')).toBeTruthy();
      expect(config.inactiveKeywords.has('DEFERRED')).toBeTruthy();
      expect(config.inactiveKeywords.has('TODO')).toBeTruthy();
      expect(config.inactiveKeywordsOrder.includes('PENDING')).toBeTruthy();
      expect(config.inactiveKeywordsOrder.indexOf('PENDING')).toBeGreaterThan(
        config.inactiveKeywordsOrder.indexOf('LATER'),
      );
      expect(config.inactiveKeywordsOrder.indexOf('BACKLOG')).toBeGreaterThan(
        config.inactiveKeywordsOrder.indexOf('PENDING'),
      );
      expect(config.inactiveKeywordsOrder.indexOf('DEFERRED')).toBeGreaterThan(
        config.inactiveKeywordsOrder.indexOf('BACKLOG'),
      );

      // Verify waiting keywords
      expect(config.waitingKeywords.has('ON-HOLD')).toBeTruthy();
      expect(config.waitingKeywords.has('BLOCKED')).toBeTruthy();
      expect(config.waitingKeywords.has('WAITING-ON')).toBeTruthy();
      expect(config.waitingKeywords.has('WAIT')).toBeTruthy();
      expect(config.waitingKeywordsOrder.includes('ON-HOLD')).toBeTruthy();
      expect(config.waitingKeywordsOrder.indexOf('ON-HOLD')).toBeGreaterThan(
        config.waitingKeywordsOrder.indexOf('WAITING'),
      );
      expect(config.waitingKeywordsOrder.indexOf('BLOCKED')).toBeGreaterThan(
        config.waitingKeywordsOrder.indexOf('ON-HOLD'),
      );
      expect(config.waitingKeywordsOrder.indexOf('WAITING-ON')).toBeGreaterThan(
        config.waitingKeywordsOrder.indexOf('BLOCKED'),
      );

      // Verify completed keywords
      expect(config.completedKeywords.has('FINISHED')).toBeTruthy();
      expect(config.completedKeywords.has('CLOSED')).toBeTruthy();
      expect(config.completedKeywords.has('ARCHIVED')).toBeTruthy();
      expect(config.completedKeywords.has('DONE')).toBeTruthy();
      expect(config.completedKeywordsOrder.includes('FINISHED')).toBeTruthy();
      expect(config.completedKeywordsOrder.indexOf('FINISHED')).toBeGreaterThan(
        config.completedKeywordsOrder.indexOf('CANCELLED'),
      );
      expect(config.completedKeywordsOrder.indexOf('CLOSED')).toBeGreaterThan(
        config.completedKeywordsOrder.indexOf('FINISHED'),
      );
      expect(config.completedKeywordsOrder.indexOf('ARCHIVED')).toBeGreaterThan(
        config.completedKeywordsOrder.indexOf('CLOSED'),
      );
    });
  });

  describe('getKeywordGroup', () => {
    test('should assign custom active keyword to group 1', () => {
      const config = buildKeywordSortConfig({
        activeKeywords: ['STARTED'],
        inactiveKeywords: [],
        waitingKeywords: ['ON-HOLD'],
        completedKeywords: [],
      });

      const task1 = { state: 'STARTED', completed: false };
      const task2 = { state: 'ON-HOLD', completed: false };
      const task3 = { state: 'LATER', completed: false };

      expect(getKeywordGroup(task1 as any, config)).toBe(1); // Active
      expect(getKeywordGroup(task2 as any, config)).toBe(4); // Waiting
      expect(getKeywordGroup(task3 as any, config)).toBe(2); // Inactive
    });

    test('should assign custom keywords to appropriate groups with multiple keywords', () => {
      const config = buildKeywordSortConfig({
        activeKeywords: ['STARTED', 'WORKING'],
        inactiveKeywords: ['PENDING', 'BACKLOG'],
        waitingKeywords: ['ON-HOLD', 'BLOCKED'],
        completedKeywords: ['FINISHED', 'CLOSED'],
      });

      // Active group tests
      expect(
        getKeywordGroup({ state: 'STARTED', completed: false } as any, config),
      ).toBe(1);
      expect(
        getKeywordGroup({ state: 'WORKING', completed: false } as any, config),
      ).toBe(1);
      expect(
        getKeywordGroup({ state: 'DOING', completed: false } as any, config),
      ).toBe(1);
      expect(
        getKeywordGroup({ state: 'NOW', completed: false } as any, config),
      ).toBe(1);

      // Inactive group tests
      expect(
        getKeywordGroup({ state: 'PENDING', completed: false } as any, config),
      ).toBe(2);
      expect(
        getKeywordGroup({ state: 'BACKLOG', completed: false } as any, config),
      ).toBe(2);
      expect(
        getKeywordGroup({ state: 'TODO', completed: false } as any, config),
      ).toBe(2);
      expect(
        getKeywordGroup({ state: 'LATER', completed: false } as any, config),
      ).toBe(2);

      // Waiting group tests
      expect(
        getKeywordGroup({ state: 'ON-HOLD', completed: false } as any, config),
      ).toBe(4);
      expect(
        getKeywordGroup({ state: 'BLOCKED', completed: false } as any, config),
      ).toBe(4);
      expect(
        getKeywordGroup({ state: 'WAIT', completed: false } as any, config),
      ).toBe(4);
      expect(
        getKeywordGroup({ state: 'WAITING', completed: false } as any, config),
      ).toBe(4);

      // Completed group tests
      expect(
        getKeywordGroup({ state: 'FINISHED', completed: true } as any, config),
      ).toBe(5);
      expect(
        getKeywordGroup({ state: 'CLOSED', completed: true } as any, config),
      ).toBe(5);
      expect(
        getKeywordGroup({ state: 'DONE', completed: true } as any, config),
      ).toBe(5);
      expect(
        getKeywordGroup({ state: 'CANCELED', completed: true } as any, config),
      ).toBe(5);
    });
  });
});
