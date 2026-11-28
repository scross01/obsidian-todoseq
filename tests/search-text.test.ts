import {
  foldSearchText,
  SearchTextCache,
  isWordContinuation,
} from '../src/search/search-text';

describe('foldSearchText', () => {
  it.each([
    ['ø', 'o'],
    ['Ø', 'o'],
    ['ł', 'l'],
    ['Ł', 'l'],
    ['đ', 'd'],
    ['Đ', 'd'],
    ['ð', 'd'],
    ['Ð', 'd'],
    ['ħ', 'h'],
    ['ı', 'i'],
    ['ß', 'ss'],
    ['ẞ', 'ss'],
    ['æ', 'ae'],
    ['Æ', 'ae'],
    ['œ', 'oe'],
    ['Œ', 'oe'],
    ['þ', 'th'],
    ['Þ', 'th'],
  ])('maps %s to %s', (input, expected) => {
    expect(foldSearchText(input)).toBe(expected);
  });

  it('folds canonical Latin diacritics in either composition', () => {
    expect(foldSearchText('café')).toBe('cafe');
    expect(foldSearchText('cafe\u0301')).toBe('cafe');
    expect(foldSearchText('CAFÉ')).toBe('cafe');
    expect(foldSearchText('Łódź')).toBe('lodz');
    expect(foldSearchText('İstanbul')).toBe('istanbul');
    expect(foldSearchText('ıstanbul')).toBe('istanbul');
    expect(foldSearchText('ắ')).toBe('a');
    expect(foldSearchText('ǿ')).toBe('o');
  });

  it('shares folded forms across multi-letter expansions', () => {
    expect(foldSearchText('Straße')).toBe(foldSearchText('STRASSE'));
    expect(foldSearchText('œuvre')).toBe(foldSearchText('oeuvre'));
  });

  it('is idempotent', () => {
    for (const value of ['Straße', 'Łódź', '東京', 'café', 'ẞ', 'e\u0301']) {
      const once = foldSearchText(value);
      expect(foldSearchText(once)).toBe(once);
    }
  });

  it('leaves ASCII punctuation, paths and regex symbols alone apart from case', () => {
    expect(foldSearchText('C++ / notes/a.md (x) [y]')).toBe(
      'c++ / notes/a.md (x) [y]',
    );
  });

  it('handles empty and mark-only input without throwing', () => {
    expect(foldSearchText('')).toBe('');
    expect(foldSearchText('\u0301')).toBe('\u0301');
  });

  it('preserves script-specific distinctions', () => {
    expect(foldSearchText('か')).not.toBe(foldSearchText('が'));
    expect(foldSearchText('क')).not.toBe(foldSearchText('कि'));
    expect(foldSearchText('علم')).not.toBe(foldSearchText('عَلَم'));
    // Canonically equivalent spellings still compare alike.
    expect(foldSearchText('が')).toBe(foldSearchText('か\u3099'));
    expect(foldSearchText('कि')).toBe(foldSearchText('क\u093f'));
  });

  it('preserves emoji variation selectors and joiners', () => {
    const heart = '\u2764\uFE0F';
    expect(foldSearchText(heart)).toBe(heart);
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(foldSearchText(family)).toBe(family);
  });

  it('does not apply compatibility normalization', () => {
    expect(foldSearchText('Ａ')).not.toBe('a');
    expect(foldSearchText('①')).not.toBe('1');
    expect(foldSearchText('ﬀ')).not.toBe('ff');
  });
});

describe('SearchTextCache', () => {
  it('returns folded values and does not retain ASCII entries', () => {
    const cache = new SearchTextCache();
    expect(cache.fold('CAFÉ')).toBe('cafe');
    expect(cache.fold('CAFÉ')).toBe('cafe');
    expect(cache.fold('plain ASCII')).toBe('plain ascii');
  });

  it('builds complete-word phrases with Unicode boundaries', () => {
    const cache = new SearchTextCache();
    expect(cache.phrase('star', false).test('a star!')).toBe(true);
    expect(cache.phrase('star', false).test('starfish')).toBe(false);
    expect(cache.phrase('star', false).test('starfish star')).toBe(true);
  });

  it('treats punctuation literally and keeps phrase boundaries', () => {
    const cache = new SearchTextCache();
    expect(
      cache.phrase('C++', false).test(foldSearchText('isolated C++ here')),
    ).toBe(true);
    expect(cache.phrase('C++', false).test(foldSearchText('C--'))).toBe(false);
    expect(cache.phrase('東京', true).test('東京')).toBe(true);
    expect(cache.phrase('東京', true).test('東京都')).toBe(false);
  });

  it('folds default phrases but keeps strict spelling and case', () => {
    const cache = new SearchTextCache();
    expect(cache.phrase('ete', false).test(foldSearchText('été'))).toBe(true);
    expect(cache.phrase('café', true).test('cafés')).toBe(false);
    expect(cache.phrase('café', true).test('café')).toBe(true);
  });

  it('defines word continuation over letters, numbers, marks and connectors', () => {
    expect(isWordContinuation('é')).toBe(true);
    expect(isWordContinuation('東')).toBe(true);
    expect(isWordContinuation('1')).toBe(true);
    expect(isWordContinuation('_')).toBe(true);
    expect(isWordContinuation(' ')).toBe(false);
    expect(isWordContinuation('+')).toBe(false);
  });
});
