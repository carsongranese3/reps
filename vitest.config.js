import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.js'],
    environment: 'node',
    // better-sqlite3 is a native addon — run each test file in its own child
    // process (rather than a worker thread) for isolation/stability, and to
    // guarantee the per-file fresh-DB trick in server/test/testApp.js works.
    pool: 'forks',
    testTimeout: 15000,
  },
});
