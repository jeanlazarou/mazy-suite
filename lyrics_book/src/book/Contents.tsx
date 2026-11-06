/**
 * The contents panel: every album, read whichever way suits.
 *
 * Changing the order here never moves a page — the book itself still reads as
 * written — so a page number stays worth writing down.
 */

import { sortAlbums, yearRange, type AlbumSummary, type ContentsOrder } from '../contents'

const ORDERS: { value: ContentsOrder; label: string }[] = [
  { value: 'as-written', label: 'As written' },
  { value: 'title', label: 'A–Z' },
  { value: 'date', label: 'By date' },
]

interface ContentsProps {
  albums: AlbumSummary[]
  order: ContentsOrder
  onOrderChange: (order: ContentsOrder) => void
  currentAlbum: string | null
  onJump: (albumIndex: number) => void
}

export function Contents({
  albums,
  order,
  onOrderChange,
  currentAlbum,
  onJump,
}: ContentsProps) {
  const listed = sortAlbums(albums, order)
  const songs = albums.reduce((total, album) => total + album.songs, 0)

  return (
    <div className="panel">
      <h2>Contents</h2>
      <p className="panel__hint">
        {albums.length} albums, {songs} songs. The book always reads as written —
        this only changes the list.
      </p>

      <div className="contents__orders">
        {ORDERS.map((option) => (
          <button
            key={option.value}
            aria-pressed={order === option.value}
            onClick={() => onOrderChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {listed.map((album) => (
        <button
          key={album.index}
          className={`result contents__album${
            album.title === currentAlbum ? ' contents__album--current' : ''
          }`}
          onClick={() => onJump(album.index)}
        >
          <div className="contents__row">
            <span className="result__title">{album.title}</span>
            <span className="contents__years">{yearRange(album)}</span>
          </div>
          <div className="result__where">
            {album.songs} song{album.songs === 1 ? '' : 's'}
            {order !== 'as-written' && ` · ${album.index + 1} as written`}
          </div>
        </button>
      ))}
    </div>
  )
}
