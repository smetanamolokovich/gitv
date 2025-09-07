// Test setup file
import 'jest';

// Global test configuration
beforeEach(() => {
  // Reset any global state before each test
  jest.clearAllMocks();
});

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock ora globally
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  }));
});
