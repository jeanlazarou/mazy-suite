import { cpSync, createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
}

// Music lives on the server and is updated over FTP, never uploaded with the
// app build. Skip Vite's public-dir copy at build time (2.9 GB otherwise) and
// copy everything except music/; `pnpm preview` serves music from public/.
const publicWithoutMusic = () => {
  let isBuild = false

  return {
    name: 'public-without-music',
    config(_, { command }) {
      isBuild = command === 'build'
      if (isBuild) return { publicDir: false }
    },
    closeBundle() {
      if (!isBuild) return

      const root = import.meta.dirname
      cpSync(join(root, 'public'), join(root, 'build'), {
        recursive: true,
        dereference: true,
        filter: (src) => !src.startsWith(join(root, 'public', 'music')),
      })
    },
    configurePreviewServer(server) {
      const musicRoot = resolve(import.meta.dirname, 'public/music')

      server.middlewares.use('/music', (req, res, next) => {
        const path = normalize(
          join(musicRoot, decodeURIComponent(req.url.split('?')[0]))
        )
        if (!path.startsWith(musicRoot)) return next()

        let stat
        try {
          stat = statSync(path)
        } catch {
          return next()
        }
        if (!stat.isFile()) return next()

        res.setHeader(
          'Content-Type',
          AUDIO_TYPES[extname(path).toLowerCase()] || 'application/octet-stream'
        )
        res.setHeader('Content-Length', stat.size)
        createReadStream(path).pipe(res)
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), publicWithoutMusic()],
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [
        '..',
        // extra dir to serve the local music metadata cache from, if any
        ...(process.env.MUSIC_CACHE_DIR ? [process.env.MUSIC_CACHE_DIR] : [])
      ]
    }
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
          wavesurfer: ['wavesurfer.js'],
        },
      },
    },
  },
  publicDir: 'public',
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  }
})