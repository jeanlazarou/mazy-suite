import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // public/ only holds the data/music links; the suite's demo site
    // (scripts/build_site.sh) serves its own shared copy at ../
    copyPublicDir: !process.env.SUITE_SITE
  },
  server: {
    port: 3000,
    open: true
  }
})
