import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Dates/times in the app are local-clock based; pin the zone so results match on every machine and in CI
    env: { TZ: 'Asia/Jerusalem' },
  },
});
