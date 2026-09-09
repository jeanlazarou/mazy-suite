/**
 * Measuring the real height of every block, once, before pages are decided.
 *
 * Heights cannot be guessed from line counts: a long line wraps, and a wrapped
 * line pushes the last stanza of a page over the edge. So every block is
 * rendered off-screen at the exact page width and measured for real.
 *
 * All 339 songs are measured in a single pass. That is around 2,000 elements
 * and one forced layout — a few hundred milliseconds once, rather than a
 * reflow every time a page is turned. It re-runs only when the page geometry
 * changes, which is why the caller debounces resizes.
 */

import { useLayoutEffect, useRef } from 'react'
import type { Album, LyricsDocument, Song } from '../parser/types'
import type { Heights } from './paginate'
import { AlbumPlate, ContinuedFrom, SongHeading, StanzaBlock } from './SongBlocks'

interface MeasurerProps {
  document: LyricsDocument
  songIndexOf: Map<Song, number>
  /** Bumped by the caller when page geometry changes, to force a re-measure. */
  geometry: string
  onMeasured: (heights: Heights) => void
}

export function Measurer({ document, songIndexOf, geometry, onMeasured }: MeasurerProps) {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return

    const heightOf = (selector: string) => {
      const element = node.querySelector<HTMLElement>(selector)
      return element ? element.getBoundingClientRect().height : 0
    }

    const album = document.albums.map((_, index) => heightOf(`[data-album="${index}"]`))

    const heading: number[] = []
    const stanza: number[][] = []
    document.songs.forEach((song, songIndex) => {
      heading[songIndex] = heightOf(`[data-heading="${songIndex}"]`)
      stanza[songIndex] = song.stanzas.map((_, stanzaIndex) =>
        heightOf(`[data-stanza="${songIndex}.${stanzaIndex}"]`),
      )
    })

    // The gaps are read from the CSS rather than repeated here, so changing
    // the page's spacing cannot silently put the pagination out of step.
    const pixels = (value: string) => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const gapOf = (selector: string, property: 'rowGap' | 'paddingTop' | 'borderTopWidth') => {
      const element = node.querySelector<HTMLElement>(selector)
      return element ? pixels(window.getComputedStyle(element)[property]) : 0
    }

    onMeasured({
      album,
      heading,
      stanza,
      continuation: heightOf('[data-continuation]'),
      stanzaGap: gapOf('[data-probe-song]', 'rowGap'),
      songGap:
        gapOf('[data-probe-body]', 'rowGap') +
        gapOf('[data-probe-next]', 'paddingTop') +
        gapOf('[data-probe-next]', 'borderTopWidth'),
    })
    // `document` and `geometry` are the only real inputs; onMeasured is stable.
  }, [document, geometry, onMeasured, songIndexOf])

  return (
    <div className="measurer" ref={root} aria-hidden="true">
      {document.albums.map((album: Album, index) => (
        <div key={`album-${index}`} data-album={index} style={{ height: 'var(--page-height)' }}>
          <AlbumPlate album={album} />
        </div>
      ))}

      {document.songs.map((song, songIndex) => (
        <div key={`song-${songIndex}`}>
          <div data-heading={songIndex}>
            {/* Measured with both tags present, so a page never overflows when
                a reuse badge appears. Costs a little white space, never a clip. */}
            <SongHeading song={song} borrowedFrom="x" lentToCount={1} />
          </div>
          {song.stanzas.map((stanza, stanzaIndex) => (
            <div key={stanzaIndex} data-stanza={`${songIndex}.${stanzaIndex}`}>
              <StanzaBlock stanza={stanza} />
            </div>
          ))}
        </div>
      ))}

      <div data-continuation="">
        <ContinuedFrom song={document.songs[0] ?? ({ name: 'x' } as Song)} />
      </div>

      {/* A page's real structure, so the gaps can be read off the CSS. */}
      <div className="page__body" data-probe-body="">
        <div className="song" data-probe-song="" />
        <div className="song" data-probe-next="" />
      </div>
    </div>
  )
}
