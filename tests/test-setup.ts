// Test setup file for Jest
import { LanguageRegistry, LanguageAwareRegexBuilder } from '../language-aware-comment-tasks';
import { DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES } from '../task';

// Create a global registry instance for all tests
const registry = new LanguageRegistry();
const regexBuilder = new LanguageAwareRegexBuilder();

// Export test utilities
export { registry, regexBuilder, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES };

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};