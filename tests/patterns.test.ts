import {
  detectListMarker,
  PRIORITY_TOKEN_REGEX,
  CHECKBOX_REGEX,
  BULLET_LIST_PATTERN,
  NUMBERED_LIST_PATTERN,
  LETTER_LIST_PATTERN,
  CUSTOM_LIST_PATTERN,
  CHECKBOX_PATTERN,
  escapeKeywordsForRegex,
  buildTaskKeywordPattern,
  CHECKBOX_DETECTION_REGEX,
  CODE_BLOCK_REGEX,
  MATH_BLOCK_REGEX,
  COMMENT_BLOCK_REGEX,
  SINGLE_LINE_COMMENT_REGEX,
  CALLOUT_BLOCK_REGEX,
  FOOTNOTE_DEFINITION_REGEX,
  TAG_PATTERN,
  WIKI_LINK_REGEX,
  MD_LINK_REGEX,
  URL_REGEX,
  QUOTE_LINE_REGEX,
  BULLET_MATCH_REGEX,
  NUMBERED_MATCH_REGEX,
  LETTER_MATCH_REGEX,
  CALLOUT_PREFIX_PATTERN,
} from '../src/utils/patterns';

describe('patterns', () => {
  describe('detectListMarker', () => {
    test('should detect checkbox marker', () => {
      const result = detectListMarker('- [ ] Task text');
      expect(result.type).toBe('checkbox');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('- [ ] ');
      expect(result.text).toBe('Task text');
    });

    test('should detect bullet marker', () => {
      const result = detectListMarker('- Task text');
      expect(result.type).toBe('bullet');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('- ');
      expect(result.text).toBe('Task text');
    });

    test('should detect numbered marker', () => {
      const result = detectListMarker('1. Task text');
      expect(result.type).toBe('numbered');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('1. ');
      expect(result.text).toBe('Task text');
    });

    test('should detect letter marker', () => {
      const result = detectListMarker('a) Task text');
      expect(result.type).toBe('letter');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('a) ');
      expect(result.text).toBe('Task text');
    });

    test('should detect quote marker', () => {
      const result = detectListMarker('> Task text');
      expect(result.type).toBe('quote');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('> ');
      expect(result.text).toBe('Task text');
    });

    test('should handle indented lines', () => {
      const result = detectListMarker('  - [ ] Indented task');
      expect(result.type).toBe('checkbox');
      expect(result.indent).toBe('  ');
      expect(result.marker).toBe('- [ ] ');
      expect(result.text).toBe('Indented task');
    });

    test('should return none for plain text', () => {
      const result = detectListMarker('Plain text line');
      expect(result.type).toBe('none');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('');
      expect(result.text).toBe('Plain text line');
    });
  });

  describe('PRIORITY_TOKEN_REGEX', () => {
    test('should match priority tokens with different letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#A]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#B]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#C]')).toBe(true);
    });

    test('should not match invalid priority letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#D]')).toBe(false);
      expect(PRIORITY_TOKEN_REGEX.test('[#Z]')).toBe(false);
    });

    test('should match priority tokens with surrounding spaces', () => {
      expect(PRIORITY_TOKEN_REGEX.test(' [#A] ')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('\t[#B]\t')).toBe(true);
    });

    test('should capture priority letter in group 2', () => {
      const match = PRIORITY_TOKEN_REGEX.exec('Task [#B] here');
      expect(match?.[2]).toBe('B');
    });
  });

  describe('CHECKBOX_REGEX', () => {
    test('should match markdown checkbox patterns with required spacing', () => {
      expect(CHECKBOX_REGEX.test('- [x] some task text')).toBe(true);
      expect(CHECKBOX_REGEX.test('* [ ] another test')).toBe(true);
      expect(CHECKBOX_REGEX.test('+ [x] more words here')).toBe(true);
    });

    test('should capture checkbox components', () => {
      const match = CHECKBOX_REGEX.exec('- [x] some task text');
      expect(match?.[1]).toBe(''); // leading spaces
      expect(match?.[2]).toBe('- [x]'); // full checkbox (note: no trailing space in capture)
      expect(match?.[3]).toBe('x'); // checkbox status
      expect(match?.[4]).toBe('some'); // first word
      expect(match?.[5]).toBe('task text'); // rest of text
    });

    test('should match with leading indentation', () => {
      const match = CHECKBOX_REGEX.exec('  - [ ] indented task here');
      expect(match?.[1]).toBe('  '); // leading spaces
      expect(match?.[2]).toBe('- [ ]'); // full checkbox (note: no trailing space in capture)
    });

    test('should not match invalid checkbox patterns', () => {
      expect(CHECKBOX_REGEX.test('- [X] task')).toBe(false); // uppercase X
      expect(CHECKBOX_REGEX.test('- [] task')).toBe(false); // no space inside
      expect(CHECKBOX_REGEX.test('[] task')).toBe(false); // no list marker
    });

    test('should match single word after checkbox', () => {
      expect(CHECKBOX_REGEX.test('- [ ] task')).toBe(true); // single word (keyword)
      expect(CHECKBOX_REGEX.test('- [x] single')).toBe(true); // single word (keyword)
    });
  });

  describe('List Pattern Detection', () => {
    test('should match bullet list patterns', () => {
      expect(BULLET_LIST_PATTERN.test('- ')).toBe(true);
      expect(BULLET_LIST_PATTERN.test('* ')).toBe(true);
      expect(BULLET_LIST_PATTERN.test('+ ')).toBe(true);
    });

    test('should match numbered list patterns', () => {
      expect(NUMBERED_LIST_PATTERN.test('1. ')).toBe(true);
      expect(NUMBERED_LIST_PATTERN.test('2) ')).toBe(true);
      expect(NUMBERED_LIST_PATTERN.test('12. ')).toBe(true);
    });

    test('should match letter list patterns', () => {
      expect(LETTER_LIST_PATTERN.test('a. ')).toBe(true);
      expect(LETTER_LIST_PATTERN.test('B) ')).toBe(true);
    });

    test('should match custom list patterns', () => {
      expect(CUSTOM_LIST_PATTERN.test('(A1) ')).toBe(true);
      expect(CUSTOM_LIST_PATTERN.test('(B2) ')).toBe(true);
    });

    test('should match checkbox patterns', () => {
      expect(CHECKBOX_PATTERN.test('[ ] ')).toBe(true);
      expect(CHECKBOX_PATTERN.test('[x] ')).toBe(true);
      expect(CHECKBOX_PATTERN.test('[*] ')).toBe(true);
    });
  });

  describe('escapeKeywordsForRegex', () => {
    test('should escape regex special characters', () => {
      expect(escapeKeywordsForRegex(['TODO', 'DOING', 'DONE'])).toBe(
        'TODO|DOING|DONE',
      );
    });

    test('should escape special regex characters in keywords', () => {
      expect(escapeKeywordsForRegex(['[x]', '(a)', 'c+d'])).toBe(
        '\\[x\\]|\\(a\\)|c\\+d',
      );
    });

    test('should escape all regex special characters', () => {
      expect(escapeKeywordsForRegex(['.*+?^${}()|[]\\'])).toBe(
        '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
      );
    });

    test('should return empty string for empty array', () => {
      expect(escapeKeywordsForRegex([])).toBe('');
    });

    test('should handle single keyword', () => {
      expect(escapeKeywordsForRegex(['TODO'])).toBe('TODO');
    });
  });

  describe('buildTaskKeywordPattern', () => {
    test('should return never-matching pattern for empty keywords', () => {
      const pattern = buildTaskKeywordPattern([]);
      const regex = new RegExp(pattern);
      expect(regex.test('anything')).toBe(false);
      expect(regex.test('TODO')).toBe(false);
      expect(regex.test('')).toBe(false);
    });

    test('should build pattern matching provided keywords', () => {
      const pattern = buildTaskKeywordPattern(['TODO', 'DOING', 'DONE']);
      const regex = new RegExp(`^${pattern}$`);
      expect(regex.test('TODO')).toBe(true);
      expect(regex.test('DOING')).toBe(true);
      expect(regex.test('DONE')).toBe(true);
      expect(regex.test('UNKNOWN')).toBe(false);
    });

    test('should handle keywords with special characters', () => {
      const pattern = buildTaskKeywordPattern(['[x]', '(a)']);
      const regex = new RegExp(pattern);
      expect(regex.test('[x]')).toBe(true);
      expect(regex.test('(a)')).toBe(true);
      expect(regex.test('x')).toBe(false);
    });

    test('should wrap keywords in capturing group', () => {
      const pattern = buildTaskKeywordPattern(['TODO']);
      expect(pattern).toBe('(TODO)');
    });
  });

  describe('CHECKBOX_DETECTION_REGEX', () => {
    test('should detect standard checkbox markers', () => {
      expect(CHECKBOX_DETECTION_REGEX.test('- [ ]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('- [x]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('* [ ]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('+ [x]')).toBe(true);
    });

    test('should detect checkbox with uppercase X and other status chars', () => {
      expect(CHECKBOX_DETECTION_REGEX.test('- [X]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('- [-]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('- [/]')).toBe(true);
    });

    test('should detect indented checkboxes', () => {
      expect(CHECKBOX_DETECTION_REGEX.test('  - [ ]')).toBe(true);
      expect(CHECKBOX_DETECTION_REGEX.test('\t- [x]')).toBe(true);
    });

    test('should capture bullet and status', () => {
      const match = CHECKBOX_DETECTION_REGEX.exec('- [x] task text');
      expect(match?.[1]).toBe('-');
      expect(match?.[2]).toBe('x');
    });

    test('should not match non-checkbox patterns', () => {
      expect(CHECKBOX_DETECTION_REGEX.test('- text')).toBe(false);
      expect(CHECKBOX_DETECTION_REGEX.test('plain text')).toBe(false);
    });
  });

  describe('CODE_BLOCK_REGEX', () => {
    test('should match backtick code blocks', () => {
      expect(CODE_BLOCK_REGEX.test('```')).toBe(true);
      expect(CODE_BLOCK_REGEX.test('````')).toBe(true);
    });

    test('should match tilde code blocks', () => {
      expect(CODE_BLOCK_REGEX.test('~~~')).toBe(true);
      expect(CODE_BLOCK_REGEX.test('~~~~')).toBe(true);
    });

    test('should match code blocks with language', () => {
      const match = CODE_BLOCK_REGEX.exec('```javascript');
      expect(match?.[1]).toBe('```');
      expect(match?.[2]).toBe('javascript');
    });

    test('should match with leading whitespace', () => {
      expect(CODE_BLOCK_REGEX.test('  ```')).toBe(true);
    });

    test('should not match fewer than 3 backticks', () => {
      expect(CODE_BLOCK_REGEX.test('``')).toBe(false);
    });
  });

  describe('MATH_BLOCK_REGEX', () => {
    test('should match opening math block', () => {
      expect(MATH_BLOCK_REGEX.test('$$')).toBe(true);
      expect(MATH_BLOCK_REGEX.test('  $$')).toBe(true);
    });

    test('should not match closing on same line as opening', () => {
      expect(MATH_BLOCK_REGEX.test('$$ E = mc^2 $$')).toBe(false);
    });
  });

  describe('COMMENT_BLOCK_REGEX', () => {
    test('should match single-line comments', () => {
      expect(COMMENT_BLOCK_REGEX.test('%% TODO task %%')).toBe(true);
      expect(COMMENT_BLOCK_REGEX.test('  %% TODO task %%')).toBe(true);
    });

    test('should match multi-line comment start', () => {
      expect(COMMENT_BLOCK_REGEX.test('%%')).toBe(true);
      expect(COMMENT_BLOCK_REGEX.test('%% some content')).toBe(true);
    });

    test('should not match unrelated text', () => {
      expect(COMMENT_BLOCK_REGEX.test('normal text')).toBe(false);
    });
  });

  describe('SINGLE_LINE_COMMENT_REGEX', () => {
    test('should match single-line comments', () => {
      expect(SINGLE_LINE_COMMENT_REGEX.test('%% TODO task %%')).toBe(true);
    });

    test('should not match unclosed comments', () => {
      expect(SINGLE_LINE_COMMENT_REGEX.test('%% TODO task')).toBe(false);
    });
  });

  describe('CALLOUT_BLOCK_REGEX', () => {
    test('should match callout lines', () => {
      expect(CALLOUT_BLOCK_REGEX.test('> callout content')).toBe(true);
      expect(CALLOUT_BLOCK_REGEX.test('  > indented callout')).toBe(true);
    });

    test('should not match non-callout lines', () => {
      expect(CALLOUT_BLOCK_REGEX.test('normal text')).toBe(false);
    });
  });

  describe('CALLOUT_PREFIX_PATTERN', () => {
    test('should match callout declarations', () => {
      expect(CALLOUT_PREFIX_PATTERN.test('> [!info] ')).toBe(true);
      expect(CALLOUT_PREFIX_PATTERN.test('> [!warning]- ')).toBe(true);
    });

    test('should match with leading whitespace', () => {
      expect(CALLOUT_PREFIX_PATTERN.test('  > [!note] ')).toBe(true);
    });
  });

  describe('FOOTNOTE_DEFINITION_REGEX', () => {
    test('should match footnote definitions', () => {
      expect(FOOTNOTE_DEFINITION_REGEX.test('[^1]: ')).toBe(true);
      expect(FOOTNOTE_DEFINITION_REGEX.test('[^10]: some text')).toBe(true);
    });

    test('should not match non-footnote patterns', () => {
      expect(FOOTNOTE_DEFINITION_REGEX.test('[1]: ')).toBe(false);
      expect(FOOTNOTE_DEFINITION_REGEX.test('^1]: ')).toBe(false);
    });
  });

  describe('TAG_PATTERN', () => {
    beforeEach(() => {
      TAG_PATTERN.lastIndex = 0;
    });

    test('should match simple tags', () => {
      const match = TAG_PATTERN.exec('#todo');
      expect(match?.[1]).toBe('todo');
    });

    test('should match hierarchical tags', () => {
      const match = TAG_PATTERN.exec('#context/home');
      expect(match?.[1]).toBe('context/home');
    });

    test('should match tags with underscores and hyphens', () => {
      const match = TAG_PATTERN.exec('#multi-word_tag');
      expect(match?.[1]).toBe('multi-word_tag');
    });

    test('should not match URL anchors', () => {
      expect(TAG_PATTERN.test('https://example.com#anchor')).toBe(false);
    });

    test('should find multiple tags in text', () => {
      const text = 'Task #todo with #context/home';
      const matches = [...text.matchAll(TAG_PATTERN)];
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe('todo');
      expect(matches[1][1]).toBe('context/home');
    });
  });

  describe('WIKI_LINK_REGEX', () => {
    beforeEach(() => {
      WIKI_LINK_REGEX.lastIndex = 0;
    });

    test('should match simple wiki links', () => {
      const match = WIKI_LINK_REGEX.exec('[[My Note]]');
      expect(match?.[1]).toBe('My Note');
      expect(match?.[2]).toBeUndefined();
    });

    test('should match wiki links with alias', () => {
      const match = WIKI_LINK_REGEX.exec('[[My Note|Display Name]]');
      expect(match?.[1]).toBe('My Note');
      expect(match?.[2]).toBe('Display Name');
    });

    test('should find multiple links in text', () => {
      const text = 'See [[Note A]] and [[Note B|B]]';
      const matches = [...text.matchAll(WIKI_LINK_REGEX)];
      expect(matches).toHaveLength(2);
    });
  });

  describe('MD_LINK_REGEX', () => {
    beforeEach(() => {
      MD_LINK_REGEX.lastIndex = 0;
    });

    test('should match standard markdown links', () => {
      const match = MD_LINK_REGEX.exec('[text](http://example.com)');
      expect(match?.[1]).toBe('text');
      expect(match?.[2]).toBe('http://example.com');
    });

    test('should handle nested brackets in label', () => {
      const match = MD_LINK_REGEX.exec('[nested [inner] text](url)');
      expect(match?.[1]).toBe('nested [inner] text');
      expect(match?.[2]).toBe('url');
    });

    test('should find multiple links in text', () => {
      const text = '[a](url1) and [b](url2)';
      const matches = [...text.matchAll(MD_LINK_REGEX)];
      expect(matches).toHaveLength(2);
    });
  });

  describe('URL_REGEX', () => {
    beforeEach(() => {
      URL_REGEX.lastIndex = 0;
    });

    test('should match http URLs', () => {
      expect(URL_REGEX.test('http://example.com')).toBe(true);
    });

    test('should match https URLs with path and query', () => {
      expect(URL_REGEX.test('https://example.com/path?q=1')).toBe(true);
    });

    test('should not match non-URLs', () => {
      expect(URL_REGEX.test('ftp://example.com')).toBe(false);
      expect(URL_REGEX.test('just text')).toBe(false);
    });

    test('should find URLs in text', () => {
      const text = 'Visit http://a.com and https://b.com';
      const matches = [...text.matchAll(URL_REGEX)];
      expect(matches).toHaveLength(2);
    });
  });

  describe('List match regexes', () => {
    test('BULLET_MATCH_REGEX should capture bullet and text', () => {
      const match = BULLET_MATCH_REGEX.exec('- task text');
      expect(match?.[1]).toBe('-');
      expect(match?.[2]).toBe('task text');
    });

    test('NUMBERED_MATCH_REGEX should capture number and text', () => {
      const match = NUMBERED_MATCH_REGEX.exec('1. task text');
      expect(match?.[1]).toBe('1.');
      expect(match?.[2]).toBe('task text');
    });

    test('LETTER_MATCH_REGEX should capture letter and text', () => {
      const match = LETTER_MATCH_REGEX.exec('a) task text');
      expect(match?.[1]).toBe('a)');
      expect(match?.[2]).toBe('task text');
    });

    test('QUOTE_LINE_REGEX should capture quoted text', () => {
      const match = QUOTE_LINE_REGEX.exec('> quoted text');
      expect(match?.[1]).toBe('quoted text');
    });
  });
});
