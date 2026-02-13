/**
 * Parser Registry for managing multiple file format parsers.
 * Provides O(1) lookup by file extension.
 */

import { ITaskParser } from './types';

/**
 * Registry for task parsers.
 * Manages parser instances and provides lookup by file extension.
 *
 * @example
 * ```typescript
 * const registry = new ParserRegistry();
 * registry.register(new MarkdownTaskParser(config));
 * registry.register(new OrgModeTaskParser(config));
 *
 * const parser = registry.getParserForExtension('.org');
 * const tasks = parser?.parseFile(content, path, file);
 * ```
 */
export class ParserRegistry {
  private parsers: Map<string, ITaskParser> = new Map();
  private extensionMap: Map<string, ITaskParser> = new Map();

  /**
   * Register a parser with the registry.
   * @param parser The parser to register
   */
  register(parser: ITaskParser): void {
    this.parsers.set(parser.parserId, parser);

    // Map each supported extension to this parser
    for (const ext of parser.supportedExtensions) {
      const normalizedExt = ext.toLowerCase();
      if (this.extensionMap.has(normalizedExt)) {
        console.warn(
          `ParserRegistry: Extension "${normalizedExt}" already registered, ` +
            `overwriting with "${parser.parserId}"`,
        );
      }
      this.extensionMap.set(normalizedExt, parser);
    }
  }

  /**
   * Get a parser by file extension.
   * @param extension File extension (with or without leading dot)
   * @returns The parser for this extension, or null if not found
   */
  getParserForExtension(extension: string): ITaskParser | null {
    // Normalize: ensure lowercase and leading dot
    let normalizedExt = extension.toLowerCase();
    if (!normalizedExt.startsWith('.')) {
      normalizedExt = '.' + normalizedExt;
    }

    return this.extensionMap.get(normalizedExt) || null;
  }

  /**
   * Get a parser by its ID.
   * @param parserId The parser identifier
   * @returns The parser, or null if not found
   */
  getParser(parserId: string): ITaskParser | null {
    return this.parsers.get(parserId) || null;
  }

  /**
   * Get all registered parsers.
   * @returns Array of all parsers
   */
  getAllParsers(): ITaskParser[] {
    return Array.from(this.parsers.values());
  }

  /**
   * Check if an extension has a registered parser.
   * @param extension File extension to check
   * @returns true if a parser exists for this extension
   */
  hasParserForExtension(extension: string): boolean {
    return this.getParserForExtension(extension) !== null;
  }

  /**
   * Get all supported file extensions.
   * @returns Array of supported extensions (with leading dots)
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Unregister a parser by its ID.
   * Removes the parser and all its extension mappings.
   * @param parserId The parser identifier to unregister
   */
  unregister(parserId: string): void {
    const parser = this.parsers.get(parserId);
    if (!parser) {
      return;
    }

    // Remove all extension mappings for this parser
    for (const ext of parser.supportedExtensions) {
      const normalizedExt = ext.toLowerCase();
      const mappedParser = this.extensionMap.get(normalizedExt);
      if (mappedParser?.parserId === parserId) {
        this.extensionMap.delete(normalizedExt);
      }
    }

    // Remove the parser itself
    this.parsers.delete(parserId);
  }

  /**
   * Clear all registered parsers.
   * Useful for testing or reinitialization.
   */
  clear(): void {
    this.parsers.clear();
    this.extensionMap.clear();
  }
}
