/**
 * Tests for file extension validation and text file detection
 * These tests verify the logic using the centralized constants from src/utils/constants.ts
 */

import {
  BINARY_EXTENSIONS,
  BINARY_EXTENSIONS_WITH_DOT,
} from '../src/utils/constants';

// Mock TFile for testing
interface MockTFile {
  path: string;
  name: string;
  extension: string;
}

// Helper to create mock TFile
function createMockTFile(
  path: string,
  name: string,
  extension: string,
): MockTFile {
  return { path, name, extension };
}

describe('File Extension Validation', () => {
  describe('Binary extensions set (with dots)', () => {
    it('should contain common image extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.png')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.jpg')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.jpeg')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.gif')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.svg')).toBe(true);
    });

    it('should contain common audio extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.mp3')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.wav')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.flac')).toBe(true);
    });

    it('should contain common video extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.mp4')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.avi')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.mkv')).toBe(true);
    });

    it('should contain common document extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.pdf')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.doc')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.docx')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.xls')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.xlsx')).toBe(true);
    });

    it('should contain common archive extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.zip')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.rar')).toBe(true);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.7z')).toBe(true);
    });

    it('should NOT contain text file extensions', () => {
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.txt')).toBe(false);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.org')).toBe(false);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.md')).toBe(false);
      expect(BINARY_EXTENSIONS_WITH_DOT.has('.json')).toBe(false);
    });
  });
});

describe('Extension Input Validation', () => {
  /**
   * Validation function - uses imported BINARY_EXTENSIONS_WITH_DOT
   */
  function validateFileExtensions(input: string): {
    valid: string[];
    invalid: string[];
    binaryWarnings: string[];
  } {
    const valid: string[] = [];
    const invalid: string[] = [];
    const binaryWarnings: string[] = [];

    // Parse CSV, trim whitespace
    const parsed = input
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter((ext) => ext.length > 0);

    for (const ext of parsed) {
      // Must start with a dot
      if (!ext.startsWith('.')) {
        invalid.push(ext);
        continue;
      }

      // Must have at least one character after the dot
      if (ext.length < 2) {
        invalid.push(ext);
        continue;
      }

      // Must contain only valid characters (letters, numbers, dots, hyphens, underscores)
      // Allow multi-level extensions like .txt.bak
      if (!/^\.[a-zA-Z0-9._-]+$/.test(ext)) {
        invalid.push(ext);
        continue;
      }

      // Check for binary file warning
      if (BINARY_EXTENSIONS_WITH_DOT.has(ext)) {
        binaryWarnings.push(ext);
      }

      valid.push(ext);
    }

    return { valid, invalid, binaryWarnings };
  }

  describe('Valid extensions', () => {
    it('should accept valid single-level extensions', () => {
      const result = validateFileExtensions('.org, .txt, .md');
      expect(result.valid).toEqual(['.org', '.txt', '.md']);
      expect(result.invalid).toEqual([]);
    });

    it('should accept valid multi-level extensions', () => {
      const result = validateFileExtensions('.txt.bak, .md.backup');
      expect(result.valid).toEqual(['.txt.bak', '.md.backup']);
      expect(result.invalid).toEqual([]);
    });

    it('should handle extra whitespace', () => {
      const result = validateFileExtensions('  .org  ,  .txt  ');
      expect(result.valid).toEqual(['.org', '.txt']);
    });

    it('should convert to lowercase', () => {
      const result = validateFileExtensions('.ORG, .TXT');
      expect(result.valid).toEqual(['.org', '.txt']);
    });

    it('should handle empty input', () => {
      const result = validateFileExtensions('');
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });

  describe('Invalid extensions', () => {
    it('should reject extensions without leading dot', () => {
      const result = validateFileExtensions('org, txt');
      expect(result.invalid).toEqual(['org', 'txt']);
    });

    it('should reject empty extensions (just dot)', () => {
      const result = validateFileExtensions('.');
      expect(result.invalid).toEqual(['.']);
    });

    it('should reject extensions with invalid characters', () => {
      const result = validateFileExtensions('.org file, .txt*, .md#');
      expect(result.invalid).toEqual(['.org file', '.txt*', '.md#']);
    });

    it('should separate valid and invalid extensions', () => {
      const result = validateFileExtensions('.org, invalid, .txt');
      expect(result.valid).toEqual(['.org', '.txt']);
      expect(result.invalid).toEqual(['invalid']);
    });
  });

  describe('Binary file warnings', () => {
    it('should warn about PDF files', () => {
      const result = validateFileExtensions('.pdf');
      expect(result.valid).toEqual(['.pdf']);
      expect(result.binaryWarnings).toEqual(['.pdf']);
    });

    it('should warn about image files', () => {
      const result = validateFileExtensions('.png, .jpg');
      expect(result.valid).toEqual(['.png', '.jpg']);
      expect(result.binaryWarnings).toEqual(['.png', '.jpg']);
    });

    it('should not warn about text files', () => {
      const result = validateFileExtensions('.org, .txt');
      expect(result.binaryWarnings).toEqual([]);
    });
  });
});

describe('Text File Detection', () => {
  function isBinaryExtension(extension: string): boolean {
    return BINARY_EXTENSIONS.has(extension.toLowerCase());
  }

  function isLikelyTextFile(file: MockTFile): boolean {
    const extension = file.extension.toLowerCase();

    // Check if the extension is a known binary type
    if (isBinaryExtension(extension)) {
      return false;
    }

    // For multi-level extensions, check the last part
    const extensionParts = extension.split('.');
    for (const part of extensionParts) {
      if (isBinaryExtension(part)) {
        return false;
      }
    }

    return true;
  }

  describe('Binary extension detection', () => {
    it('should detect image files as binary', () => {
      expect(isBinaryExtension('png')).toBe(true);
      expect(isBinaryExtension('jpg')).toBe(true);
      expect(isBinaryExtension('gif')).toBe(true);
      expect(isBinaryExtension('svg')).toBe(true);
    });

    it('should detect audio files as binary', () => {
      expect(isBinaryExtension('mp3')).toBe(true);
      expect(isBinaryExtension('wav')).toBe(true);
      expect(isBinaryExtension('flac')).toBe(true);
    });

    it('should detect video files as binary', () => {
      expect(isBinaryExtension('mp4')).toBe(true);
      expect(isBinaryExtension('avi')).toBe(true);
      expect(isBinaryExtension('mkv')).toBe(true);
    });

    it('should detect document files as binary', () => {
      expect(isBinaryExtension('pdf')).toBe(true);
      expect(isBinaryExtension('doc')).toBe(true);
      expect(isBinaryExtension('docx')).toBe(true);
    });

    it('should NOT detect text files as binary', () => {
      expect(isBinaryExtension('txt')).toBe(false);
      expect(isBinaryExtension('org')).toBe(false);
      expect(isBinaryExtension('md')).toBe(false);
      expect(isBinaryExtension('json')).toBe(false);
      expect(isBinaryExtension('yaml')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isBinaryExtension('PNG')).toBe(true);
      expect(isBinaryExtension('Jpg')).toBe(true);
      expect(isBinaryExtension('PDF')).toBe(true);
    });
  });

  describe('isLikelyTextFile function', () => {
    it('should return true for markdown files', () => {
      const file = createMockTFile('note.md', 'note.md', 'md');
      expect(isLikelyTextFile(file)).toBe(true);
    });

    it('should return true for text files', () => {
      const file = createMockTFile('notes.txt', 'notes.txt', 'txt');
      expect(isLikelyTextFile(file)).toBe(true);
    });

    it('should return true for org files', () => {
      const file = createMockTFile('notes.org', 'notes.org', 'org');
      expect(isLikelyTextFile(file)).toBe(true);
    });

    it('should return false for PDF files', () => {
      const file = createMockTFile('document.pdf', 'document.pdf', 'pdf');
      expect(isLikelyTextFile(file)).toBe(false);
    });

    it('should return false for image files', () => {
      const file = createMockTFile('image.png', 'image.png', 'png');
      expect(isLikelyTextFile(file)).toBe(false);
    });

    it('should return false for multi-level extensions ending in binary', () => {
      // Note: In Obsidian, file.extension is the last part after the last dot
      // So a file named "file.txt.pdf" would have extension "pdf"
      const file = createMockTFile('file.txt.pdf', 'file.txt.pdf', 'pdf');
      expect(isLikelyTextFile(file)).toBe(false);
    });

    it('should return true for multi-level text extensions', () => {
      // A file named "file.txt.bak" would have extension "bak"
      // Since "bak" is not in the binary list, it should be considered text
      const file = createMockTFile('file.txt.bak', 'file.txt.bak', 'bak');
      expect(isLikelyTextFile(file)).toBe(true);
    });
  });
});

describe('Should Scan File Logic', () => {
  /**
   * Simulates the shouldScanFile logic from VaultScanner
   */
  function shouldScanFile(
    file: MockTFile,
    additionalExtensions: string[],
    excludedPaths: string[] = [],
  ): boolean {
    // Check if file is excluded
    if (excludedPaths.some((p) => file.path.includes(p))) {
      return false;
    }

    // Check if file is a markdown file
    if (file.extension === 'md') {
      return true;
    }

    // Check if file extension matches any additional extensions from settings
    if (additionalExtensions.length > 0) {
      const fileExtension = '.' + file.extension.toLowerCase();
      // Check for exact match
      if (additionalExtensions.includes(fileExtension)) {
        return true;
      }
      // Check for multi-level extension match
      const fileName = file.name.toLowerCase();
      for (const ext of additionalExtensions) {
        if (fileName.endsWith(ext.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  it('should scan markdown files by default', () => {
    const file = createMockTFile('note.md', 'note.md', 'md');
    expect(shouldScanFile(file, [])).toBe(true);
  });

  it('should not scan non-markdown files by default', () => {
    const file = createMockTFile('notes.org', 'notes.org', 'org');
    expect(shouldScanFile(file, [])).toBe(false);
  });

  it('should scan files with additional extensions', () => {
    const file = createMockTFile('notes.org', 'notes.org', 'org');
    expect(shouldScanFile(file, ['.org'])).toBe(true);
  });

  it('should scan files with multiple additional extensions', () => {
    const orgFile = createMockTFile('notes.org', 'notes.org', 'org');
    const txtFile = createMockTFile('notes.txt', 'notes.txt', 'txt');
    expect(shouldScanFile(orgFile, ['.org', '.txt'])).toBe(true);
    expect(shouldScanFile(txtFile, ['.org', '.txt'])).toBe(true);
  });

  it('should scan files with multi-level extensions', () => {
    // For a file named "notes.txt.bak", Obsidian gives extension "bak"
    // But we check the full filename for multi-level extension match
    const file = createMockTFile('notes.txt.bak', 'notes.txt.bak', 'bak');
    expect(shouldScanFile(file, ['.txt.bak'])).toBe(true);
  });

  it('should not scan excluded files', () => {
    const file = createMockTFile('archive/note.md', 'note.md', 'md');
    expect(shouldScanFile(file, [], ['archive'])).toBe(false);
  });

  it('should be case-insensitive for extensions', () => {
    const file = createMockTFile('notes.ORG', 'notes.ORG', 'ORG');
    expect(shouldScanFile(file, ['.org'])).toBe(true);
  });
});
