/**
 * The pieces a page is built from.
 *
 * These same components render both the visible page and the off-screen
 * measurer, so what gets measured is exactly what gets laid out. Any styling
 * that changes a height must apply to both, which is why nothing here takes a
 * "compact" or "preview" variant.
 */

import type { Album, Song, Stanza } from '../parser/types'

/** Wrap the searched-for words in a highlight, without using innerHTML. */
function highlight(text: string, term: string) {
  if (!term) return text
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  )
}

export function AlbumPlate({ album }: { album: Album }) {
  return (
    <div className="album-plate">
      <div className="album-plate__eyebrow">Album</div>
      <h2 className="album-plate__title">{album.title}</h2>
      <div className="album-plate__rule" />
      <div className="album-plate__count">
        {album.songs.length} song{album.songs.length === 1 ? '' : 's'}
      </div>
    </div>
  )
}

export function StanzaBlock({ stanza, term }: { stanza: Stanza; term?: string }) {
  return (
    <div className="stanza">
      {stanza.lines.map((line) => (
        <p
          key={line.line}
          className={[
            'line',
            line.emphasis ? 'line--emphasis' : '',
            line.indented ? 'line--indented' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {highlight(line.text, term ?? '')}
        </p>
      ))}
    </div>
  )
}

export function SongHeading({
  song,
  borrowedFrom,
  lentToCount,
}: {
  song: Song
  borrowedFrom?: string | null
  lentToCount?: number
}) {
  const dates = song.dates.map((date) => date.raw).join(' / ')
  const meta = [dates, song.authors.join(', ')].filter(Boolean).join(' · ')

  return (
    <div className="song__heading">
      <h3 className="song__title">
        {song.name}
        {song.variant && <span className="song__variant">*</span>}
        {song.qualifier && <span className="song__variant"> ({song.qualifier})</span>}
      </h3>
      {meta && <div className="song__meta">{meta}</div>}
      {song.originalTitle && <div className="song__meta">Original: {song.originalTitle}</div>}
      {song.reference && (
        <div className="song__meta">
          After “{song.reference.title}” — {song.reference.artist}
          {song.reference.year ? ` (${song.reference.year})` : ''}
        </div>
      )}
      {borrowedFrom && <div className="song__tag">words from {borrowedFrom}</div>}
      {!!lentToCount && (
        <div className="song__tag">
          reused in {lentToCount} later song{lentToCount === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}

export function ContinuedFrom({ song }: { song: Song }) {
  return <div className="song__continued">{song.name}, continued</div>
}
