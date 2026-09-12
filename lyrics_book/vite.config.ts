import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Logger, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Put `lyrics.md` where the book can read it, in dev and in a build.
 *
 * The file lives at the suite root, outside this app, and is deliberately not
 * committed — it is personal data. So it is never copied into `public/`, where
 * it would be one `git add` away from being published by accident. Instead:
 *
 *   dev    the server reads it in place on every request, because it is edited
 *          by hand while the book is open;
 *   build  its current contents are written into `dist/`, so the built book is
 *          self-contained and can be published as it stands.
 *
 * The build is the moment the lyrics leave this machine, so it says out loud
 * what it is about to include. `LYRICS_FILE` points somewhere else;
 * `LYRICS_EMBED=0` builds the book without any lyrics in it, leaving the file
 * picker as the way in.
 */
function lyricsFile(): Plugin {
  const path = resolve(process.env.LYRICS_FILE ?? '../lyrics.md')
  const embed = process.env.LYRICS_EMBED !== '0'
  let logger: Logger | null = null

  return {
    name: 'lyrics-file',

    configResolved(config) {
      logger = config.logger
    },

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

    generateBundle() {
      if (!embed) {
        logger?.warn('  lyrics.md not embedded (LYRICS_EMBED=0) — the book will ask for a file')
        return
      }

      let source: string
      try {
        source = readFileSync(path, 'utf8')
      } catch {
        logger?.warn(`  lyrics.md not found at ${path} — the book will ask for a file`)
        return
      }

      this.emitFile({ type: 'asset', fileName: 'lyrics.md', source })

      // Say which file is going out and how fresh it is — the build is the
      // moment the lyrics leave this machine. Deliberately no song count: that
      // would mean importing the parser into the build config, and `pnpm
      // report` already answers that question properly.
      const edited = statSync(path).mtime.toISOString().slice(0, 16).replace('T', ' ')
      logger?.info(`  lyrics.md embedded from ${path} — last edited ${edited}`)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), lyricsFile()],
})
