/** Unit tests live next to the code as *.test.ts; the Sprint 1 smoke test
 *  (test/sprint1.smoke.mjs) needs a running API and is run separately. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};
