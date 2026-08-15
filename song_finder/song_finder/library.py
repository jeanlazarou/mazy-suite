"""Building the searchable library out of the shared data folder.

Three files describe an album and each contributes a different alias:

``<album>.json``
    the playlist — ``title`` is the song, ``url`` carries the collaboration
    file name the mix was saved under
``<album>.md``
    the description — ``$T:<title>`` blocks carry the kompoz collaboration link
    and an ``Original:`` line with the full collaboration title
``lyrics/<Title>.srt``
    the words

They are joined on the song title.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterator, List, Optional

from .config import SERVED_MUSIC_PREFIX, Config
from .lyrics import read_lyrics
from .models import Album, Track
from .text import strip_variant_marker

_TRACK_MARKER = re.compile(r"\$T:(.*)")
_KOMPOZ_LINK = re.compile(r"kompoz\.com/studio/collaboration/(\d+)")
_ORIGINAL_LINE = re.compile(r"Original:\s*(.+?)\s*$")


class LibraryError(Exception):
    """The library could not be read."""


@dataclass
class MarkdownEntry:
    """What an album's ``.md`` knows about one track."""

    kompoz_id: Optional[str] = None
    original_title: Optional[str] = None


@dataclass
class Library:
    """Every album and track found, plus whatever went wrong on the way."""

    albums: List[Album] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def tracks(self) -> List[Track]:
        return [track for album in self.albums for track in album.tracks]

    def __iter__(self) -> Iterator[Track]:
        return iter(self.tracks)

    def __len__(self) -> int:
        return sum(len(album.tracks) for album in self.albums)


def parse_markdown(text: str) -> Dict[str, MarkdownEntry]:
    """Map track title -> what the album description says about it.

    A ``$T:`` line opens a block that runs until the next one; the kompoz link
    and ``Original:`` line inside it belong to that track.
    """
    entries: Dict[str, MarkdownEntry] = {}
    current: Optional[MarkdownEntry] = None

    for line in text.splitlines():
        marker = _TRACK_MARKER.search(line)
        if marker:
            # `\*` in the markdown is a literal marker character in the title.
            title = marker.group(1).strip().replace("\\*", "*").replace("\\+", "+")
            current = MarkdownEntry()
            entries[strip_variant_marker(title)] = current
            continue

        if current is None:
            continue

        link = _KOMPOZ_LINK.search(line)
        if link:
            current.kompoz_id = link.group(1)

        original = _ORIGINAL_LINE.search(line)
        if original:
            current.original_title = original.group(1)

    return entries


def local_path_for(url: str, music_dir: Path) -> Path:
    """Turn a served playlist url into a path on this machine.

    Urls normally start with ``/music/files/``; anything else is treated as
    already relative to the music folder rather than dropped, so odd entries
    stay findable.
    """
    if url.startswith(SERVED_MUSIC_PREFIX):
        relative = url[len(SERVED_MUSIC_PREFIX) :]
    else:
        relative = url.lstrip("/")

    return music_dir / relative


def _load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        raise
    except (OSError, ValueError) as error:
        raise LibraryError(f"cannot read {path.name}: {error}") from error


def _load_album(name: str, config: Config, warnings: List[str]) -> Optional[Album]:
    album_file = config.data_dir / f"{name}.json"
    try:
        data = _load_json(album_file)
    except FileNotFoundError:
        warnings.append(f"{name}: no {album_file.name}")
        return None
    except LibraryError as error:
        warnings.append(str(error))
        return None

    period = data.get("period") or {}
    album = Album(
        name=name,
        title=data.get("title") or name,
        period_from=period.get("from", ""),
        period_to=period.get("to", ""),
    )

    markdown_file = config.data_dir / f"{name}.md"
    try:
        entries = parse_markdown(markdown_file.read_text(encoding="utf-8"))
    except OSError:
        entries = {}

    for position, item in enumerate(data.get("playlist") or [], start=1):
        track = _build_track(item, album, position, entries, config, warnings)
        if track is not None:
            album.tracks.append(track)

    return album


def _build_track(
    item: dict,
    album: Album,
    position: int,
    entries: Dict[str, MarkdownEntry],
    config: Config,
    warnings: List[str],
) -> Optional[Track]:
    url = item.get("url")
    if not url:
        warnings.append(f"{album.name}: track {position} has no url")
        return None

    title = item.get("title")
    if not title:
        # Fall back to the file name so the track is still findable.
        title = Path(url).stem
        warnings.append(f"{album.name}: track {position} has no title, using '{title}'")

    name = strip_variant_marker(title)
    entry = entries.get(name, MarkdownEntry())

    lyrics_file = config.lyrics_dir / f"{name}.srt"
    lyrics_text = read_lyrics(lyrics_file) if lyrics_file.is_file() else ""

    return Track(
        title=title,
        name=name,
        album_name=album.name,
        album_title=album.title,
        url=url,
        local_path=local_path_for(url, config.music_dir),
        original_file=Path(url).stem,
        authors=list(item.get("authors") or []),
        creation_date=item.get("creationDate") or "",
        original_title=entry.original_title,
        kompoz_id=entry.kompoz_id,
        lyrics=lyrics_text or None,
        lyrics_path=lyrics_file if lyrics_text else None,
        track_number=position,
    )


def load_library(config: Config) -> Library:
    """Read ``albums.json`` and everything it points at.

    ``albums.json`` is the authority on what counts as an album, which keeps
    scratch playlists in the data folder out of the index.
    """
    try:
        listed = _load_json(config.albums_file)
    except FileNotFoundError as error:
        raise LibraryError(f"no albums.json in {config.data_dir}") from error

    if not isinstance(listed, list):
        raise LibraryError("albums.json must contain a list")

    library = Library()
    for entry in listed:
        name = entry.get("name") if isinstance(entry, dict) else None
        if not name:
            library.warnings.append("albums.json: entry without a name")
            continue

        album = _load_album(name, config, library.warnings)
        if album is not None:
            library.albums.append(album)

    return library
