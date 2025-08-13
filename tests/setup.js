"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Test setup file
const globals_1 = require("@jest/globals");
// Global test timeout
globals_1.jest.setTimeout(30000);
// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.HTTP_PORT = '3000';
process.env.MATCHMAKER_PORT = '9999';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-min-32-chars';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.SESSION_TIMEOUT_MS = '30000'; // 30 seconds for faster tests
process.env.HEALTH_CHECK_INTERVAL_MS = '5000'; // 5 seconds for faster tests
// Setup global mocks
global.console = {
    ...console,
    // Uncomment to suppress console logs during tests
    // log: jest.fn(),
    // debug: jest.fn(),
    // info: jest.fn(),
    // warn: jest.fn(),
    // error: jest.fn(),
};
//# sourceMappingURL=setup.js.map