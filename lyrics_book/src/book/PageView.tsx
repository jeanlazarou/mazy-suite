/**
 * One page of the book.
 *
 * The page has a fixed size and clips: pagination has already decided that
 * everything here fits, and a page that grew to fit its content would defeat
 * the point of turning to a known place.
 */

import type { Reuse } from '../reuse'
import type { Page } from './paginate'
import { AlbumPlate, ContinuedFrom, SongHeading, StanzaBlock } from './SongBlocks'

interface PageViewProps {
  page: Page | null
  side: 'left' | 'right' | 'single'
  reuse: Reuse
  /** Term to highlight on the page, when a search sent the reader here. */
  term?: string
  total: number
}

export function PageView({ page, side, reuse, term, total }: PageViewProps) {
  if (!page) return <div className={`page page--${side} page--blank`} />

  return (
    <div className={`page page--${side}`}>
      <div className="page__body">
        {page.items.map((item, index) => {
          if (item.kind === 'album') {
            return <AlbumPlate key={`album-${item.albumIndex}`} album={item.album} />
          }

          const borrowed = reuse.borrowed.get(item.songIndex)
          const lent = reuse.lentTo.get(item.songIndex)

          return (
            <div className="song" key={`song-${item.songIndex}-${index}`}>
              {item.opening ? (
                <SongHeading
                  song={item.song}
                  borrowedFrom={borrowed?.to ? borrowed.to.name : borrowed?.wanted ?? null}
                  lentToCount={lent?.length ?? 0}
                />
              ) : (
                <ContinuedFrom song={item.song} />
              )}
              {item.stanzas.map((stanza) => (
                <StanzaBlock key={stanza.line} stanza={stanza} term={term} />
              ))}
            </div>
          )
        })}
      </div>

      <div className="page__folio">
        <span>{page.albumTitle ?? ''}</span>
        <span>
          {page.index + 1} / {total}
        </span>
      </div>
    </div>
  )
}
