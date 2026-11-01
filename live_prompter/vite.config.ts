import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative, for the portal site, which serves the app under /mazy-suite/live_prompter/
  base: './',
  plugins: [react()],
  build: {
    // public/ only holds the data/music links, and music can be a whole
    // collection; the suite's demo site (scripts/build_site.sh) serves its own
    // shared copy at ../
    copyPublicDir: !process.env.SUITE_SITE
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  server: {
    fs: {
      strict: false
    }
  }
});