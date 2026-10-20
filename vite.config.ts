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
    // 既存のテストは「置いたらすぐ登場する」前提。登場の溜めは summon-windup.test.ts だけで有効にする
    setupFiles: ['./__tests__/setup.ts'],
  },
});
