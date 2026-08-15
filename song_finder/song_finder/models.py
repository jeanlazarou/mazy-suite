"""The things a song is known by.

One :class:`Track` gathers every name a song answers to — the song title, the
collaboration file it was mixed to, the kompoz collaboration, its authors, its
lyrics — so a search can start from whichever one you happen to remember.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from .text import normalize, squeeze

#: Field names usable as ``field:term`` in a query, mapped to their aliases.
FIELD_ALIASES = {
    "title": "title",
    "song": "title",
    "orig": "original",
    "original": "original",
    "file": "original",
    "album": "album",
    "author": "author",
    "by": "author",
    "lyrics": "lyrics",
    "words": "lyrics",
    "id": "kompoz",
    "kompoz": "kompoz",
    "date": "date",
    "year": "date",
}

SEARCHABLE_FIELDS = ("title", "original", "album", "author", "lyrics", "kompoz", "date")

#: Fields that also get a spaces-removed index, for run-together queries.
SQUEEZABLE_FIELDS = ("title", "original", "album", "author")


@dataclass
class Track:
    """A single song, with every alias it is findable by."""

    title: str
    """Playlist title, variant marker included (``"Dead Love*"``)."""

    name: str
    """Song title proper, variant marker stripped — what a copy is renamed to."""

    album_name: str
    """Album slug, i.e. the base name of its files in ``data/``."""

    album_title: str
    url: str
    """Served path, ``/music/files/<Album>/<file>.mp3``."""

    local_path: Path
    """Where the audio sits on this machine."""

    original_file: str
    """Collaboration name the mix was saved under, from the url (no extension)."""

    authors: List[str] = field(default_factory=list)
    creation_date: str = ""
    original_title: Optional[str] = None
    """Full original title from the album's ``.md``, when it differs from the file."""

    kompoz_id: Optional[str] = None
    lyrics: Optional[str] = None
    lyrics_path: Optional[Path] = None
    track_number: int = 0

    # Normalised copies, built once at load time; the matcher only reads these.
    _index: dict = field(default_factory=dict, repr=False, compare=False)

    def __post_init__(self) -> None:
        self._index = {
            "title": normalize(self.name),
            "original": normalize(
                " ".join(filter(None, [self.original_file, self.original_title]))
            ),
            "album": normalize(f"{self.album_title} {self.album_name}"),
            "author": normalize(" ".join(self.authors)),
            "lyrics": normalize(self.lyrics or ""),
            "kompoz": self.kompoz_id or "",
            "date": self.creation_date,
        }
        # Run-together copies, so 'couldntmake' still finds "Couldn't Make".
        # Not worth it for lyrics (too long to be selective) or dates.
        for name in SQUEEZABLE_FIELDS:
            self._index[f"_squeezed_{name}"] = squeeze(self._index[name])

    @property
    def exists(self) -> bool:
        """Is the audio file actually present locally?"""
        return self.local_path.is_file()

    @property
    def has_lyrics(self) -> bool:
        return bool(self.lyrics)

    @property
    def renamed_to_title(self) -> str:
        """File name a copy gets when renaming to the song title."""
        return f"{self.name}{self.local_path.suffix or '.mp3'}"

    @property
    def kompoz_url(self) -> Optional[str]:
        if not self.kompoz_id:
            return None
        return f"https://www.kompoz.com/studio/collaboration/{self.kompoz_id}"

    @property
    def authors_line(self) -> str:
        return ", ".join(self.authors)

    def indexed(self, field_name: str) -> str:
        return self._index.get(field_name, "")

    def as_dict(self) -> dict:
        """Plain data, for ``--json`` output."""
        return {
            "title": self.name,
            "playlist_title": self.title,
            "album": self.album_title,
            "album_name": self.album_name,
            "original_file": self.original_file,
            "original_title": self.original_title,
            "authors": list(self.authors),
            "creation_date": self.creation_date,
            "kompoz_id": self.kompoz_id,
            "kompoz_url": self.kompoz_url,
            "url": self.url,
            "path": str(self.local_path),
            "exists": self.exists,
            "has_lyrics": self.has_lyrics,
            "lyrics_path": str(self.lyrics_path) if self.lyrics_path else None,
        }


@dataclass
class Album:
    name: str
    title: str
    tracks: List[Track] = field(default_factory=list)
    period_from: str = ""
    period_to: str = ""

    @property
    def period(self) -> str:
        if self.period_from and self.period_to:
            return f"{self.period_from} – {self.period_to}"
        return self.period_from or self.period_to
