import { createHash } from 'node:crypto'
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
 *
 * ## Why the lyrics carry a version
 *
 * Vite fingerprints the scripts and styles it builds, so a browser that has
 * been here before picks up new ones on its own. `lyrics.md` is emitted under
 * a fixed name and gets no such help: republish an edited book and a returning
 * reader keeps the copy their browser cached, with no sign anything is wrong.
 * That happened — an album was deleted, the book was rebuilt, and the album
 * was still there.
 *
 * So the build hashes the exact bytes it embeds and the book asks for
 * `lyrics.md?v=<hash>`. The address changes only when the words change, which
 * is what makes a rebuild enough to publish, while a book that has not changed
 * still loads from cache.
 */
function lyricsFile(): Plugin {
  const path = resolve(process.env.LYRICS_FILE ?? '../lyrics.md')
  const embed = process.env.LYRICS_EMBED !== '0'
  let logger: Logger | null = null
  /** Read once, so the hash is of exactly the bytes that get emitted. */
  let embedded: string | null = null

  return {
    name: 'lyrics-file',

    config(_userConfig, { command }) {
      // Dev needs no version: the middleware below forbids caching outright,
      // because the file is edited by hand while the book is open.
      if (command !== 'build' || !embed) {
        return { define: { __LYRICS_VERSION__: JSON.stringify('dev') } }
      }

      try {
        embedded = readFileSync(path, 'utf8')
      } catch {
        return { define: { __LYRICS_VERSION__: JSON.stringify('none') } }
      }

      const version = createHash('sha256').update(embedded).digest('hex').slice(0, 12)
      return { define: { __LYRICS_VERSION__: JSON.stringify(version) } }
    },

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

      if (embedded === null) {
        logger?.warn(`  lyrics.md not found at ${path} — the book will ask for a file`)
        return
      }

      this.emitFile({ type: 'asset', fileName: 'lyrics.md', source: embedded })

      // Say which file is going out, how fresh it is, and the version readers
      // will be asked for — the build is the moment the lyrics leave this
      // machine. Deliberately no song count: that would mean importing the
      // parser into the build config, and `pnpm report` answers it properly.
      const edited = statSync(path).mtime.toISOString().slice(0, 16).replace('T', ' ')
      const version = createHash('sha256').update(embedded).digest('hex').slice(0, 12)
      logger?.info(`  lyrics.md embedded from ${path}`)
      logger?.info(`  last edited ${edited}, published as v=${version}`)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), lyricsFile()],
})
