/**
 * Getting `lyrics.md` in front of the parser.
 *
 * In development the Vite plugin serves the file from the suite root, so the
 * book opens on the real thing with no setup. A built copy has no such server,
 * and the file is personal data that should not be baked into a bundle — so
 * when the fetch fails the reader is asked to pick the file, which needs no
 * permissions and works in every browser.
 */

import { useCallback, useEffect, useState } from 'react'
import { parseLyricsDocument } from './parser/parse'
import type { LyricsDocument } from './parser/types'

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; document: LyricsDocument }
  | { status: 'needs-file'; reason: string }

export function useLyricsFile() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch('lyrics.md')
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`)
        return response.text()
      })
      .then((source) => {
        // A dev server that answers every path with index.html would otherwise
        // be parsed as a very strange lyrics file.
        if (/^\s*<(?:!doctype|html)/i.test(source)) throw new Error('not the lyrics file')
        if (cancelled) return
        setState({ status: 'ready', document: parseLyricsDocument(source) })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'needs-file', reason: 'lyrics.md was not served' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const openFile = useCallback((file: File) => {
    setState({ status: 'loading' })
    file
      .text()
      .then((source) => setState({ status: 'ready', document: parseLyricsDocument(source) }))
      .catch(() => setState({ status: 'needs-file', reason: 'that file could not be read' }))
  }, [])

  return { state, openFile }
}
