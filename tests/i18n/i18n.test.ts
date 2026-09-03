import type { Mock } from 'jest-mock';
import { en } from '../../src/i18n/locales/en';
import { zh } from '../../src/i18n/locales/zh';
import { detectLanguage, getLang, setLang, t } from '../../src/i18n';

/**
 * The engine keeps module-level state (currentLang) and reads
 * window.localStorage — both are reset before every test. The default node
 * environment provides a window mock (tests/test-setup.ts) WITHOUT
 * localStorage, so tests install a controllable mock.
 */
type MockedWindow = { localStorage?: { getItem: Mock } };

const getWindow = (): MockedWindow =>
  globalThis.window as unknown as MockedWindow;

const setStoredLanguage = (value: string | null): void => {
  (getWindow().localStorage?.getItem as Mock).mockReturnValue(value);
};

describe('i18n engine', () => {
  beforeEach(() => {
    getWindow().localStorage = { getItem: jest.fn() as Mock };
    setLang('en');
  });

  describe('t()', () => {
    it('returns the English string for a key', () => {
      expect(t('settings.general.formatTaskKeywords.name')).toBe(
        'Format task keywords',
      );
    });

    it('returns the Chinese string after setLang("zh")', () => {
      setLang('zh');
      expect(t('settings.general.formatTaskKeywords.name')).toBe(
        '高亮任务关键词',
      );
    });

    it('falls back to English when the key is missing in the current locale', () => {
      setLang('zh');
      const zhTree = zh as unknown as {
        settings: { headings: Record<string, string> };
      };
      const original = zhTree.settings.headings.taskDetection;
      try {
        delete zhTree.settings.headings.taskDetection;
        expect(t('settings.headings.taskDetection')).toBe('Task detection');
      } finally {
        zhTree.settings.headings.taskDetection = original;
      }
    });

    it('returns the raw key when it is missing in all locales', () => {
      expect(t('definitely.not.a.key' as never)).toBe('definitely.not.a.key');
    });

    it('interpolates {variable} placeholders', () => {
      const enTree = en as unknown as { notices: Record<string, string> };
      enTree.notices.testInterpolation = 'Hello {name}, you have {count} tasks';
      try {
        expect(
          t('notices.testInterpolation' as never, { name: 'Ada', count: 3 }),
        ).toBe('Hello Ada, you have 3 tasks');
        // Missing vars are left as literal placeholders
        expect(t('notices.testInterpolation' as never, { name: 'Ada' })).toBe(
          'Hello Ada, you have {count} tasks',
        );
      } finally {
        delete enTree.notices.testInterpolation;
      }
    });
  });

  describe('detectLanguage()', () => {
    it("returns 'en' when localStorage language is null", () => {
      setStoredLanguage(null);
      expect(detectLanguage()).toBe('en');
    });

    it("returns 'zh' when language is 'zh'", () => {
      setStoredLanguage('zh');
      expect(detectLanguage()).toBe('zh');
    });

    it("returns 'zh' when language is 'zh-TW'", () => {
      setStoredLanguage('zh-TW');
      expect(detectLanguage()).toBe('zh');
    });

    it("returns 'en' for unsupported codes (e.g. 'de')", () => {
      setStoredLanguage('de');
      expect(detectLanguage()).toBe('en');
    });

    it("returns 'en' when localStorage is unavailable", () => {
      delete getWindow().localStorage;
      expect(detectLanguage()).toBe('en');
    });
  });

  describe('getLang()', () => {
    it('reflects the last setLang() call', () => {
      expect(getLang()).toBe('en');
      setLang('zh');
      expect(getLang()).toBe('zh');
      setLang('en');
      expect(getLang()).toBe('en');
    });
  });
});
