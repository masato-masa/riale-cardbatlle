import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパスで配信される。リポジトリ名と必ず一致させること。
export default defineConfig({
  base: '/riale-cardbatlle/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 60000,
  },
});
