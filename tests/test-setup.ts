// Test setup file for Jest
import { LanguageRegistry } from '../src/parser/language-registry';

// Create a global registry instance for all tests
const registry = new LanguageRegistry();

// Export test utilities
export { registry };

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
