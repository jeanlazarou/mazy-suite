import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Content hash of the Go engine files in public/. Vite fingerprints the
// app's own bundles, but public files keep fixed URLs, so after a deploy a
// browser could pair the new bundle with a cached old engine.wasm ("unknown
// WASM function"). The worker appends this to their URLs instead.
function engineVersion(): string {
  const hash = createHash('sha256')
  try {
    for (const f of ['public/engine.wasm', 'public/wasm_exec.js']) {
      hash.update(readFileSync(new URL(f, import.meta.url)))
    }
  } catch {
    return 'dev' // engine not built yet
  }
  return hash.digest('hex').slice(0, 12)
}

export default defineConfig({
  // Relative base so the built app works from any deployment path
  // (e.g. https://example.org/music/mastering/). The WASM worker receives
  // the resolved base at init time — see engine.ts / engine.worker.ts.
  base: './',
  plugins: [react()],
  define: {
    __ENGINE_VERSION__: JSON.stringify(engineVersion()),
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
