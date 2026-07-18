import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the built app works from any deployment path
  // (e.g. https://example.org/music/mastering/). The WASM worker receives
  // the resolved base at init time — see engine.ts / engine.worker.ts.
  base: './',
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
