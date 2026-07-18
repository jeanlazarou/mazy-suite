import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { suiteBridge } from './vite-suite-bridge.js';

export default defineConfig({
  base: './',
  plugins: [react(), suiteBridge()],
  server: {
    fs: { allow: ['..'] }, // suite convention (player_editor): data lives in ../data
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
