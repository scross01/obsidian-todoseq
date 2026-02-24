// Test for link patterns used in task-list-view.ts
// These regexes are used to extract and render links in task text

import {
  MD_LINK_REGEX,
  WIKI_LINK_REGEX,
  URL_REGEX,
  TAG_PATTERN,
} from '../src/utils/patterns';

describe('MD_LINK_REGEX', () => {
  beforeEach(() => {
    // Reset regex lastIndex before each test
    MD_LINK_REGEX.lastIndex = 0;
  });

  describe('basic markdown links', () => {
    test('should extract label and URL from simple markdown link', () => {
      const text = 'Task with [example](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example'); // label
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should extract label and URL from link with spaces', () => {
      const text = 'Task with [example text](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example text'); // label
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should extract label and URL from link with special characters', () => {
      const text = 'Task with [example-test](https://example.com/path) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example-test'); // label
      expect(match?.[2]).toBe('https://example.com/path'); // URL
    });
  });

  describe('markdown links with square brackets in label', () => {
    test('should correctly extract label with single pair of nested square brackets', () => {
      const text =
        'TODO task with square bracket in URL title [example [test]](https://example.com)';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example [test]'); // label with nested brackets
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should correctly extract label with multiple nested square brackets', () => {
      const text =
        'Task with [example [test] [more]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example [test] [more]'); // label with multiple nested brackets
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should correctly extract label with brackets at start and end', () => {
      const text = 'Task with [[start]middle[end]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('[start]middle[end]'); // label with brackets at edges
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should correctly extract label with nested brackets and text before', () => {
      const text =
        'Task with text before [prefix [nested]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('prefix [nested]'); // label with prefix and nested brackets
      expect(match?.[2]).toBe('https://example.com'); // URL
    });
  });

  describe('markdown links with empty or minimal labels', () => {
    test('should handle label with only square brackets containing content', () => {
      const text = 'Task with [[content]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('[content]'); // label with brackets and content
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should handle label with brackets containing only spaces', () => {
      const text = 'Task with [[ ]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('[ ]'); // label with brackets and space
      expect(match?.[2]).toBe('https://example.com'); // URL
    });
  });

  describe('markdown links with complex URLs', () => {
    test('should handle URL with query parameters', () => {
      const text =
        'Task with [example](https://example.com?param=value&other=test) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example'); // label
      expect(match?.[2]).toBe('https://example.com?param=value&other=test'); // URL with params
    });

    test('should handle URL with fragment', () => {
      const text = 'Task with [example](https://example.com#section) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example'); // label
      expect(match?.[2]).toBe('https://example.com#section'); // URL with fragment
    });

    test('should handle URL with path containing parentheses - stops at first closing paren', () => {
      const text = 'Task with [example](https://example.com/path(test)) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example'); // label
      // Note: The regex stops at the first closing parenthesis
      expect(match?.[2]).toBe('https://example.com/path(test'); // URL truncated at first )
    });
  });

  describe('multiple markdown links in text', () => {
    test('should find first link when multiple exist', () => {
      const text =
        'Task with [first](https://first.com) and [second](https://second.com)';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('first'); // first label
      expect(match?.[2]).toBe('https://first.com'); // first URL
    });

    test('should find second link with subsequent exec call', () => {
      const text =
        'Task with [first](https://first.com) and [second](https://second.com)';
      MD_LINK_REGEX.exec(text); // Find first
      const match = MD_LINK_REGEX.exec(text); // Find second

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('second'); // second label
      expect(match?.[2]).toBe('https://second.com'); // second URL
    });
  });

  describe('edge cases', () => {
    test('should not match text without markdown link', () => {
      const text = 'Task with no link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match text with only opening bracket', () => {
      const text = 'Task with [only bracket';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match text with only closing parenthesis', () => {
      const text = 'Task with only parenthesis)';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should handle label with escaped characters', () => {
      const text = 'Task with [example\\[test\\]](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('example\\[test\\]'); // label with escaped brackets
      expect(match?.[2]).toBe('https://example.com'); // URL
    });

    test('should not match deeply nested brackets (regex limitation)', () => {
      const text =
        'Task with [example [[deeply]] nested](https://example.com) link';
      const match = MD_LINK_REGEX.exec(text);

      // The regex only handles one level of nesting
      expect(match).toBeNull();
    });
  });
});

describe('WIKI_LINK_REGEX', () => {
  beforeEach(() => {
    // Reset regex lastIndex before each test
    WIKI_LINK_REGEX.lastIndex = 0;
  });

  describe('basic wiki links', () => {
    test('should extract note name from simple wiki link', () => {
      const text = 'Task with [[Note]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('Note'); // note name
      expect(match?.[2]).toBeUndefined(); // no alias
    });

    test('should extract note name and alias from wiki link with alias', () => {
      const text = 'Task with [[Note|Display Name]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('Note'); // note name
      expect(match?.[2]).toBe('Display Name'); // alias
    });

    test('should handle wiki link with path', () => {
      const text = 'Task with [[path/to/Note]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('path/to/Note'); // note name with path
      expect(match?.[2]).toBeUndefined(); // no alias
    });

    test('should handle wiki link with path and alias', () => {
      const text = 'Task with [[path/to/Note|Display]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('path/to/Note'); // note name with path
      expect(match?.[2]).toBe('Display'); // alias
    });
  });

  describe('wiki links with special characters', () => {
    test('should handle note name with spaces', () => {
      const text = 'Task with [[My Note]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('My Note'); // note name with spaces
    });

    test('should handle note name with hyphens', () => {
      const text = 'Task with [[my-note]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('my-note'); // note name with hyphens
    });

    test('should handle note name with underscores', () => {
      const text = 'Task with [[my_note]] link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('my_note'); // note name with underscores
    });
  });

  describe('multiple wiki links in text', () => {
    test('should find first link when multiple exist', () => {
      const text = 'Task with [[First]] and [[Second]]';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('First'); // first note name
      expect(match?.[2]).toBeUndefined(); // no alias
    });

    test('should find second link with subsequent exec call', () => {
      const text = 'Task with [[First]] and [[Second]]';
      WIKI_LINK_REGEX.exec(text); // Find first
      const match = WIKI_LINK_REGEX.exec(text); // Find second

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('Second'); // second note name
      expect(match?.[2]).toBeUndefined(); // no alias
    });
  });

  describe('edge cases', () => {
    test('should not match text without wiki link', () => {
      const text = 'Task with no link';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match text with only opening brackets', () => {
      const text = 'Task with [[only brackets';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match text with only closing brackets', () => {
      const text = 'Task with only brackets]]';
      const match = WIKI_LINK_REGEX.exec(text);

      expect(match).toBeNull();
    });
  });
});

describe('URL_REGEX', () => {
  beforeEach(() => {
    // Reset regex lastIndex before each test
    URL_REGEX.lastIndex = 0;
  });

  describe('basic URLs', () => {
    test('should extract http URL', () => {
      const text = 'Task with http://example.com link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('http://example.com');
    });

    test('should extract https URL', () => {
      const text = 'Task with https://example.com link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com');
    });

    test('should extract URL with path', () => {
      const text = 'Task with https://example.com/path/to/page link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com/path/to/page');
    });
  });

  describe('URLs with query parameters and fragments', () => {
    test('should extract URL with query parameters', () => {
      const text = 'Task with https://example.com?param=value&other=test link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com?param=value&other=test');
    });

    test('should extract URL with fragment', () => {
      const text = 'Task with https://example.com#section link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com#section');
    });

    test('should extract URL with both query and fragment', () => {
      const text = 'Task with https://example.com?param=value#section link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com?param=value#section');
    });
  });

  describe('URLs with special characters', () => {
    test('should extract URL with port number', () => {
      const text = 'Task with https://example.com:8080 link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com:8080');
    });

    test('should extract URL with username and password', () => {
      const text = 'Task with https://user:pass@example.com link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://user:pass@example.com');
    });

    test('should extract URL with encoded characters', () => {
      const text = 'Task with https://example.com/path%20with%20spaces link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://example.com/path%20with%20spaces');
    });
  });

  describe('multiple URLs in text', () => {
    test('should find first URL when multiple exist', () => {
      const text = 'Task with https://first.com and https://second.com';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://first.com');
    });

    test('should find second URL with subsequent exec call', () => {
      const text = 'Task with https://first.com and https://second.com';
      URL_REGEX.exec(text); // Find first
      const match = URL_REGEX.exec(text); // Find second

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://second.com');
    });
  });

  describe('edge cases', () => {
    test('should not match text without URL', () => {
      const text = 'Task with no link';
      const match = URL_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match ftp protocol', () => {
      const text = 'Task with ftp://example.com link';
      const match = URL_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should not match www without protocol', () => {
      const text = 'Task with www.example.com link';
      const match = URL_REGEX.exec(text);

      expect(match).toBeNull();
    });

    test('should stop at closing parenthesis', () => {
      const text = 'Task with https://example.com/path(test) link';
      const match = URL_REGEX.exec(text);

      expect(match).not.toBeNull();
      // URL_REGEX stops at closing parenthesis
      expect(match?.[0]).toBe('https://example.com/path(test');
    });
  });
});

describe('TAG_PATTERN', () => {
  beforeEach(() => {
    // Reset regex lastIndex before each test
    TAG_PATTERN.lastIndex = 0;
  });

  describe('basic tags', () => {
    test('should extract simple tag', () => {
      const text = 'Task with #tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should extract tag with hyphens', () => {
      const text = 'Task with #my-tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#my-tag');
      expect(match?.[1]).toBe('my-tag');
    });

    test('should extract tag with underscores', () => {
      const text = 'Task with #my_tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#my_tag');
      expect(match?.[1]).toBe('my_tag');
    });

    test('should extract tag with numbers', () => {
      const text = 'Task with #tag123';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag123');
      expect(match?.[1]).toBe('tag123');
    });
  });

  describe('tags with special characters', () => {
    test('should extract tag with forward slash', () => {
      const text = 'Task with #context/home';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#context/home');
      expect(match?.[1]).toBe('context/home');
    });

    test('should extract tag with multiple slashes', () => {
      const text = 'Task with #project/subfolder/nested';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#project/subfolder/nested');
      expect(match?.[1]).toBe('project/subfolder/nested');
    });

    test('should extract tag with emoji', () => {
      const text = 'Task with #emoji🎯';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#emoji🎯');
      expect(match?.[1]).toBe('emoji🎯');
    });

    test('should extract tag with multibyte characters', () => {
      const text = 'Task with #中文标签';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#中文标签');
      expect(match?.[1]).toBe('中文标签');
    });
  });

  describe('tags with hyphens and underscores', () => {
    test('should extract tag with mixed hyphens and underscores', () => {
      const text = 'Task with #my-tag_name';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#my-tag_name');
      expect(match?.[1]).toBe('my-tag_name');
    });

    test('should extract tag with consecutive hyphens', () => {
      const text = 'Task with #my--tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#my--tag');
      expect(match?.[1]).toBe('my--tag');
    });

    test('should extract tag with consecutive underscores', () => {
      const text = 'Task with #my__tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#my__tag');
      expect(match?.[1]).toBe('my__tag');
    });
  });

  describe('multiple tags in text', () => {
    test('should find first tag when multiple exist', () => {
      const text = 'Task with #first and #second';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#first');
      expect(match?.[1]).toBe('first');
    });

    test('should find second tag with subsequent exec call', () => {
      const text = 'Task with #first and #second';
      TAG_PATTERN.exec(text); // Find first
      const match = TAG_PATTERN.exec(text); // Find second

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#second');
      expect(match?.[1]).toBe('second');
    });

    test('should find all tags in sequence', () => {
      const text = 'Task with #one #two #three';
      const matches: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = TAG_PATTERN.exec(text)) !== null) {
        matches.push(match[0]);
      }

      expect(matches).toEqual(['#one', '#two', '#three']);
    });
  });

  describe('edge cases', () => {
    test('should not match text without tag', () => {
      const text = 'Task with no tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).toBeNull();
    });

    test('should match hash followed by numbers', () => {
      const text = 'Task with #123';
      const match = TAG_PATTERN.exec(text);

      // Numbers after # are valid tags
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#123');
      expect(match?.[1]).toBe('123');
    });

    test('should not match URL anchor (negative lookbehind)', () => {
      const text = 'Check https://example.com#section';
      const match = TAG_PATTERN.exec(text);

      // The negative lookbehind prevents matching URL anchors
      expect(match).toBeNull();
    });

    test('should not match hash in the middle of a word', () => {
      const text = 'Task with hash#inmiddle';
      const match = TAG_PATTERN.exec(text);

      expect(match).toBeNull();
    });

    test('should not match hash at end of word without following content', () => {
      const text = 'Task with word#';
      const match = TAG_PATTERN.exec(text);

      expect(match).toBeNull();
    });

    test('should stop at closing bracket', () => {
      const text = 'Task with #tag]';
      const match = TAG_PATTERN.exec(text);

      // The regex stops at ), ], }, or >
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should stop at closing parenthesis', () => {
      const text = 'Task with #tag)';
      const match = TAG_PATTERN.exec(text);

      // The regex stops at ), ], }, or >
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should stop at closing brace', () => {
      const text = 'Task with #tag}';
      const match = TAG_PATTERN.exec(text);

      // The regex stops at ), ], }, or >
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should stop at closing angle bracket', () => {
      const text = 'Task with #tag>';
      const match = TAG_PATTERN.exec(text);

      // The regex stops at ), ], }, or >
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should match tag after other content', () => {
      const text = 'Task with prefix #tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });

    test('should match tag with preceding whitespace', () => {
      const text = 'Task with  #tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });
  });

  describe('tags in different contexts', () => {
    test('should extract tag from task text', () => {
      const text = 'TODO Important task #urgent #work';
      const matches: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = TAG_PATTERN.exec(text)) !== null) {
        matches.push(match[0]);
      }

      expect(matches).toEqual(['#urgent', '#work']);
    });

    test('should extract tag from text with punctuation (comma included)', () => {
      const text = 'Task with #tag, and more text';
      const match = TAG_PATTERN.exec(text);

      // The regex stops at whitespace, ), ], or }, but not comma
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag,');
      expect(match?.[1]).toBe('tag,');
    });

    test('should extract tag at end of text', () => {
      const text = 'Task with content #tag';
      const match = TAG_PATTERN.exec(text);

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('#tag');
      expect(match?.[1]).toBe('tag');
    });
  });
});
