/**
 * The book.
 *
 * State is deliberately small: which page is open, what was searched for, and
 * which panel is showing. Everything else — pages, matches, reuse links — is
 * derived, so there is nothing to keep in sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Measurer } from './book/Measurer'
import { PageView } from './book/PageView'
import { pageOfAlbum, pageOfSong, paginate, type Heights, type Page } from './book/paginate'
import { resolveReuse } from './reuse'
import { buildIndex, parseQuery, search } from './search/search'
import { useLyricsFile } from './useLyricsFile'
import type { LyricsDocument } from './parser/types'

/** Below this the spread folds down to a single page. */
const SPREAD_MIN_WIDTH = 1040

type Panel = 'none' | 'search' | 'problems'

export default function App() {
  const { state, openFile } = useLyricsFile()

  if (state.status === 'loading') {
    return <div className="notice">Opening the book…</div>
  }

  if (state.status === 'needs-file') {
    return (
      <div className="notice">
        <p>
          {state.reason}. Run <code>pnpm dev</code> from <code>lyrics_book/</code> with{' '}
          <code>lyrics.md</code> at the suite root, or point <code>LYRICS_FILE</code> at it.
        </p>
        <label>
          Choose lyrics.md…
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) openFile(file)
            }}
          />
        </label>
      </div>
    )
  }

  return <Book document={state.document} />
}

function Book({ document }: { document: LyricsDocument }) {
  const [heights, setHeights] = useState<Heights | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<Panel>('none')
  const [term, setTerm] = useState('')
  const [spread, setSpread] = useState(() => window.innerWidth >= SPREAD_MIN_WIDTH)
  const [pageHeight, setPageHeight] = useState(0)
  const bookRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const songIndexOf = useMemo(() => {
    const map = new Map(document.songs.map((song, index) => [song, index]))
    return map
  }, [document])

  const reuse = useMemo(() => resolveReuse(document), [document])
  const index = useMemo(() => buildIndex(document), [document])
  const matches = useMemo(() => (query.trim() ? search(index, query) : []), [index, query])

  // Page geometry comes from the ruler page, which is always in the document.
  // Taking it from a real page would deadlock — no height, so no pages, so no
  // page to measure — while keeping the CSS the one source of a page's size.
  useEffect(() => {
    const measure = () => {
      setSpread(window.innerWidth >= SPREAD_MIN_WIDTH)
      const body = bookRef.current?.querySelector<HTMLElement>('.page--ruler .page__body')
      if (body) setPageHeight(body.getBoundingClientRect().height)
    }

    measure()
    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 200)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const pages: Page[] = useMemo(() => {
    if (!heights || !pageHeight) return []
    return paginate(document.albums, songIndexOf, heights, { pageHeight })
  }, [document, songIndexOf, heights, pageHeight])

  const songPages = useMemo(() => pageOfSong(pages), [pages])
  const albumPages = useMemo(() => pageOfAlbum(pages), [pages])

  const step = spread ? 2 : 1
  const lastPage = Math.max(0, pages.length - 1)

  const turn = useCallback(
    (delta: number) => {
      setPageIndex((current) => {
        const next = current + delta * step
        return Math.max(0, Math.min(next, lastPage))
      })
    },
    [step, lastPage],
  )

  const goTo = useCallback(
    (target: number) => {
      // Land on the left page of the spread, so the target is always visible.
      setPageIndex(spread ? Math.max(0, target - (target % 2)) : target)
    },
    [spread],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement
      if (event.key === '/' && !typing) {
        event.preventDefault()
        setPanel('search')
        searchRef.current?.focus()
        return
      }
      if (event.key === 'Escape') {
        setPanel('none')
        return
      }
      if (typing) return

      switch (event.key) {
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault()
          turn(-1)
          break
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault()
          turn(1)
          break
        case 'Home':
          event.preventDefault()
          setPageIndex(0)
          break
        case 'End':
          event.preventDefault()
          setPageIndex(lastPage)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn, lastPage])

  // The measurer is heavy — every song, off-screen — so it is mounted only
  // until it has reported, and again if the page geometry ever changes.
  const geometry = `${pageHeight}`
  const [measuredFor, setMeasuredFor] = useState<string | null>(null)
  const onMeasured = useCallback(
    (next: Heights) => {
      setHeights(next)
      setMeasuredFor(geometry)
    },
    [geometry],
  )

  const left = pages[pageIndex] ?? null
  const right = spread ? pages[pageIndex + 1] ?? null : null
  const currentAlbum = left?.albumTitle ?? right?.albumTitle ?? null

  return (
    <div className="app">
      {pageHeight > 0 && measuredFor !== geometry && (
        <Measurer
          document={document}
          songIndexOf={songIndexOf}
          geometry={geometry}
          onMeasured={onMeasured}
        />
      )}

      <div className="bar">
        <div className="bar__title">Lyrics Book</div>
        <div className="bar__search">
          <input
            ref={searchRef}
            value={query}
            placeholder="Search words, titles, by:author, album:…   ( / )"
            onChange={(event) => {
              setQuery(event.target.value)
              setPanel(event.target.value.trim() ? 'search' : 'none')
            }}
          />
        </div>
        <div className="bar__spacer" />
        <button
          aria-pressed={panel === 'problems'}
          onClick={() => setPanel(panel === 'problems' ? 'none' : 'problems')}
        >
          {document.anomalies.length} to look at
        </button>
        <button onClick={() => setPageIndex(0)}>First page</button>
      </div>

      <div className="book" ref={bookRef}>
        <div className="page page--single page--ruler" aria-hidden="true">
          <div className="page__body" />
          <div className="page__folio">
            <span>ruler</span>
            <span>0 / 0</span>
          </div>
        </div>

        <button
          className="turn turn--back"
          onClick={() => turn(-1)}
          disabled={pageIndex === 0}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pages.length === 0 ? (
          <div className="notice">Laying out {document.songs.length} songs…</div>
        ) : spread ? (
          <>
            <PageView page={left} side="left" reuse={reuse} term={term} total={pages.length} />
            <PageView page={right} side="right" reuse={reuse} term={term} total={pages.length} />
          </>
        ) : (
          <PageView page={left} side="single" reuse={reuse} term={term} total={pages.length} />
        )}

        <button
          className="turn turn--forward"
          onClick={() => turn(1)}
          disabled={pageIndex >= lastPage}
          aria-label="Next page"
        >
          ›
        </button>

        {panel === 'search' && (
          <div className="panel">
            <h2>{matches.length} result{matches.length === 1 ? '' : 's'}</h2>
            <p className="panel__hint">
              Searches words, titles, albums and authors. Narrow with{' '}
              <code>by:</code>, <code>album:</code>, <code>words:</code>, <code>year:</code>.
            </p>
            {matches.map((match) => (
              <button
                key={match.songIndex}
                className="result"
                onClick={() => {
                  const target = songPages.get(match.songIndex)
                  if (target === undefined) return
                  setTerm(parseQuery(query).term)
                  goTo(target)
                  setPanel('none')
                }}
              >
                <div className="result__title">{match.song.name}</div>
                <div className="result__where">
                  {match.song.albumTitle} · matched {match.field}
                </div>
                {match.line && <div className="result__line">{match.line}</div>}
              </button>
            ))}
          </div>
        )}

        {panel === 'problems' && (
          <div className="panel">
            <h2>{document.anomalies.length} things to look at</h2>
            <p className="panel__hint">
              Found by reading the file; nothing is changed. Line numbers are into{' '}
              <code>lyrics.md</code>.
            </p>
            {document.anomalies.map((anomaly, position) => (
              <div className="problem" key={position}>
                <div className="problem__kind">{anomaly.kind.replace(/-/g, ' ')}</div>
                <div>{anomaly.message}</div>
                <div className="problem__line">lyrics.md:{anomaly.line}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="scrubber">
        {document.albums.map((album, albumIndex) => {
          const target = albumPages.get(albumIndex)
          return (
            <button
              key={albumIndex}
              className={[
                'scrubber__album',
                album.title === currentAlbum ? 'scrubber__album--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ flexGrow: Math.max(1, album.songs.length) }}
              onClick={() => target !== undefined && goTo(target)}
            >
              <span>{album.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
