import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Serve `lyrics.md` to the dev server.
 *
 * The file lives at the suite root, outside this app, and is deliberately not
 * committed — it is personal data. Rather than copy it into `public/`, where it
 * would be easy to commit by accident, the dev server reads it in place.
 *
 * Set `LYRICS_FILE` to point somewhere else. The app falls back to a file
 * picker when this endpoint is not there, so a production build still works.
 */
function serveLyricsFile(): Plugin {
  const path = resolve(process.env.LYRICS_FILE ?? '../lyrics.md')

  return {
    name: 'serve-lyrics-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/lyrics.md', (_request, response) => {
        try {
          const source = readFileSync(path, 'utf8')
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          // Always re-read: the file is edited by hand while the book is open.
          response.setHeader('Cache-Control', 'no-store')
          response.end(source)
        } catch {
          response.statusCode = 404
          response.end(`Cannot read ${path}`)
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serveLyricsFile()],
})
