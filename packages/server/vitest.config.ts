import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      '../../private-games/other-games/server-hyperbloom/test/**/*.test.ts',
      '../../private-games/other-games/server-tashkalar/test/**/*.test.ts',
    ],
  },
});
