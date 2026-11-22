import {
  extractTaskProperties,
  isPropertiesDrawerStart,
  parseDependencyReference,
  parsePropertyLine,
  readTaskPropertiesDrawer,
  tokenizeDependencyValue,
} from '../src/utils/task-properties';

describe('parsePropertyLine', () => {
  test('parses mixed-case, punctuation keys, empty values and append markers', () => {
    expect(
      parsePropertyLine('  :Blocker: alpha beta', 3, 'markdown'),
    ).toMatchObject({
      key: 'Blocker',
      canonicalKey: 'BLOCKER',
      append: false,
      value: 'alpha beta',
      line: 3,
    });
    expect(parsePropertyLine(':Custom.Key+: a b', 4, 'markdown')).toMatchObject(
      {
        key: 'Custom.Key+',
        canonicalKey: null,
        append: true,
        value: 'a b',
      },
    );
    expect(parsePropertyLine(':ID:', 5, 'markdown')).toMatchObject({
      canonicalKey: 'ID',
      value: '',
    });
    expect(parsePropertyLine('> > :BLOCKER: one', 6, 'markdown')).toMatchObject(
      {
        canonicalKey: 'BLOCKER',
        value: 'one',
        quotePrefix: '> > ',
      },
    );
  });

  test('does not treat prose as a property', () => {
    expect(
      parsePropertyLine('This is not a property', 0, 'markdown'),
    ).toBeNull();
    expect(parsePropertyLine(':not closed', 0, 'markdown')).toBeNull();
  });
});

describe('readTaskPropertiesDrawer', () => {
  test('reads a bounded drawer with unknown and blank lines', () => {
    const lines = [
      'TODO Task',
      ':PROPERTIES:',
      ':ID: task-1',
      ':Unknown: keep me',
      '',
      ':BLOCKER: task-2 task-3',
      ':END:',
      'TODO Child',
    ];
    const drawer = readTaskPropertiesDrawer(lines, 1, 'markdown', {
      taskIndent: '',
    });
    expect(drawer).toMatchObject({ startLine: 1, endLine: 6, closed: true });
    expect(drawer?.entries.map((entry) => entry.key)).toEqual([
      'ID',
      'Unknown',
      'BLOCKER',
    ]);
    expect(extractTaskProperties(drawer!, 'markdown')).toMatchObject({
      id: 'task-1',
      blockedBy: ['task-2', 'task-3'],
    });
  });

  test('stops before a child task when the drawer is unclosed', () => {
    const lines = [
      'TODO Parent',
      ':PROPERTIES:',
      ':ID: parent-1',
      'TODO Child',
      '  - [ ] checkbox',
    ];
    const drawer = readTaskPropertiesDrawer(lines, 1, 'markdown', {
      taskIndent: '',
    });
    expect(drawer).toMatchObject({
      startLine: 1,
      endLine: 2,
      closed: false,
    });
    expect(extractTaskProperties(drawer!, 'markdown')).toMatchObject({
      id: 'parent-1',
      propertyIssues: [{ code: 'malformed-drawer', line: 3 }],
    });
  });

  test('does not attach a drawer at an incompatible Markdown indent', () => {
    const lines = ['TODO Parent', ':PROPERTIES:', ':ID: outside', ':END:'];
    expect(
      readTaskPropertiesDrawer(lines, 1, 'markdown', {
        taskIndent: '  ',
      }),
    ).toBeNull();
  });

  test('accepts a quoted drawer for a quoted task', () => {
    expect(isPropertiesDrawerStart('> :PROPERTIES:', 'markdown', '> ')).toBe(
      true,
    );
    const lines = ['> TODO Task', '> :PROPERTIES:', '> :ID: quoted', '> :END:'];
    const drawer = readTaskPropertiesDrawer(lines, 1, 'markdown', {
      taskIndent: '> ',
    });
    expect(extractTaskProperties(drawer!, 'markdown').id).toBe('quoted');
  });
});

describe('dependency reference lexing', () => {
  test('keeps a file-qualified anchor with spaces as one token', () => {
    const tokens = tokenizeDependencyValue(
      'alpha [[Research Notes#^collect-data]] beta',
      'markdown',
    );
    expect(tokens.map((token) => token.raw)).toEqual([
      'alpha',
      '[[Research Notes#^collect-data]]',
      'beta',
    ]);
    expect(tokens[1].reference).toMatchObject({
      kind: 'markdown-anchor',
      path: 'Research Notes',
      anchor: 'collect-data',
    });
  });

  test('rejects bare anchors, embeds, aliases and malformed links as one token', () => {
    for (const raw of [
      '^collect-data',
      '![[Research#^collect-data]]',
      '[[Research#^collect-data|research]]',
      '[[Research]]',
      '[[Research#^]]',
      '[[#^collect-data]]',
    ]) {
      expect(parseDependencyReference(raw, 'markdown').kind).toBe('invalid');
    }
  });

  test('treats ^foo as an ordinary Org ID but keeps previous-sibling reserved', () => {
    expect(parseDependencyReference('^foo', 'org')).toEqual({
      kind: 'id',
      raw: '^foo',
      id: '^foo',
    });
    expect(parseDependencyReference('previous-sibling', 'markdown')).toEqual({
      kind: 'previous-sibling',
      raw: 'previous-sibling',
    });
  });
});

describe('extractTaskProperties', () => {
  const drawer = (lines: string[]) =>
    readTaskPropertiesDrawer(
      ['TODO Task', ':PROPERTIES:', ...lines, ':END:'],
      1,
      'markdown',
    )!;

  test('extracts ID, BLOCKER append values, history and preserves order', () => {
    const result = extractTaskProperties(
      drawer([
        ':ID: paper-01',
        ':BLOCKER: data-02 literature-03 data-02',
        ':BLOCKER+: approval-04',
        ':ARCHIVED_BLOCKER: old-01',
        ':ARCHIVED_BLOCKER+: old-02',
        ':TRIGGER: do-not-run',
      ]),
      'markdown',
    );
    expect(result).toMatchObject({
      id: 'paper-01',
      blockedBy: ['data-02', 'literature-03', 'approval-04'],
      archivedBlockers: ['old-01', 'old-02'],
      properties: {
        ID: 'paper-01',
        BLOCKER: 'data-02 literature-03 data-02 approval-04',
        ARCHIVED_BLOCKER: 'old-01 old-02',
      },
    });
    expect(result.propertyIssues).toBeUndefined();
  });

  test('supports append-only values and mixed-case keys', () => {
    const result = extractTaskProperties(
      drawer([':blocker+: one two']),
      'markdown',
    );
    expect(result.blockedBy).toEqual(['one', 'two']);
  });

  test('first base value wins and duplicate keys remain visible', () => {
    const result = extractTaskProperties(
      drawer([':BLOCKER: one', ':BLOCKER: two']),
      'markdown',
    );
    expect(result.blockedBy).toEqual(['one']);
    expect(result.propertyIssues).toEqual([
      expect.objectContaining({ code: 'duplicate-key', key: 'BLOCKER' }),
    ]);
  });

  test('reports invalid IDs and malformed references without accidental IDs', () => {
    const result = extractTaskProperties(
      drawer([':ID: not valid', ':BLOCKER: good [[bad link']),
      'markdown',
    );
    expect(result.id).toBeUndefined();
    expect(result.blockedBy).toEqual(['good']);
    expect(result.propertyIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-id', key: 'ID' }),
        expect.objectContaining({
          code: 'invalid-reference',
          key: 'BLOCKER',
          reference: '[[bad link',
        }),
      ]),
    );
  });

  test('history-only drawers are non-blocking data and do not require targets', () => {
    const result = extractTaskProperties(
      drawer([':ARCHIVED_BLOCKER: archived-1']),
      'markdown',
    );
    expect(result.blockedBy).toBeUndefined();
    expect(result.archivedBlockers).toEqual(['archived-1']);
  });

  test('org reference values remain IDs only', () => {
    const result = extractTaskProperties(
      readTaskPropertiesDrawer(
        ['* TODO Task', ':PROPERTIES:', ':BLOCKER: ^foo [[wiki]]', ':END:'],
        1,
        'org',
      )!,
      'org',
    );
    expect(result.blockedBy).toEqual(['^foo', '[[wiki]]']);
  });
});
