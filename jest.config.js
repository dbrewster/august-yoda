export default {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'node',
  // transform: {},
  // transform: { "^.+\\.ts?$": ["ts-jest", {"rootDir": "."}]},
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};