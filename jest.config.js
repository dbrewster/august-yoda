/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // transform: {},
  // transform: { "^.+\\.ts?$": ["ts-jest", {"rootDir": "."}]},
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};