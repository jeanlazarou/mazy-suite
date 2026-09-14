import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { suiteBridge } from './vite-suite-bridge.js';

export default defineConfig({
  base: './',
  server: {
    fs: { allow: ['..'] }, // suite convention: public/data is a symlink into ../
  },
  plugins: [react(), suiteBridge()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
