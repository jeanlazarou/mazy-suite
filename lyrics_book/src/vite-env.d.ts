/// <reference types="vite/client" />

/**
 * Fingerprint of the `lyrics.md` embedded by the build, used to ask for it at
 * an address that changes when the words do. `'dev'` while the dev server is
 * serving the file uncached, `'none'` when no lyrics were embedded.
 */
declare const __LYRICS_VERSION__: string
