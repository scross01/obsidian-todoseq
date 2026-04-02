// Test setup file for Jest
import { LanguageRegistry } from '../src/parser/language-registry';

// Create a global registry instance for all tests
const registry = new LanguageRegistry();

// Export test utilities
export { registry };

// Mock console methods to reduce noise during tests
// Use jest.Mock to allow tests to spy on console calls when needed
const createSilentMock = () => jest.fn();

global.console = {
  ...console,
  log: createSilentMock(),
  debug: createSilentMock(),
  info: createSilentMock(),
  warn: createSilentMock(),
  error: console.error, // Keep error to surface real issues
};
