import { defineConfig } from 'vitest/config';

// Heavy simulation scenarios run in their own project so CI can run them in parallel with the rest.
const SLOW = [
  'src/sim/infection/spread.test.ts',
  'src/sim/population/corridors.test.ts',
  'tests/m2-acceptance.test.ts',
  'tests/m3-acceptance.test.ts',
  'tests/determinism.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: { name: 'fast', include: ['tests/**/*.test.ts', 'src/**/*.test.ts'], exclude: SLOW },
      },
      { extends: true, test: { name: 'slow', include: SLOW, testTimeout: 300_000 } },
    ],
  },
});
