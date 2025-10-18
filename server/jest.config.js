module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: [
    "**/__tests__/**/*.ts",
    "**/?(*.)+(spec|test).ts",
    "**/?(*.)+(spec|test).js",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.d.ts",
    "!src/database/init.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testTimeout: 30000,
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
};
