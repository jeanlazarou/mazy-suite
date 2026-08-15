"""A miniature library on disk, shaped exactly like the real data folder."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from song_finder.config import Config
from song_finder.library import load_library

ALBUMS = [{"name": "couldn-t-make"}, {"name": "solo-work"}]

COLLAB_ALBUM = {
    "title": "Couldn't Make",
    "period": {"from": "2025/07/09", "to": "2025/09/09"},
    "playlist": [
        {
            "url": "/music/files/Couldn't Make/And Chill.mp3",
            "title": "Asymmetric Love",
            "creationDate": "2025/07/30",
            "authors": ["Mikael Lindh", "Jean Lazarou"],
        },
        {
            "url": "/music/files/Couldn't Make/It's a long way.mp3",
            "title": "So Much",
            "creationDate": "2025/08/07",
            "authors": ["Taylor Brae", "Jean Lazarou"],
        },
        {
            "url": "/music/files/Couldn't Make/Date Yourself.mp3",
            "title": "To This Café",
            "creationDate": "2025/07/20",
            "authors": ["Robbin Lace", "Jean Lazarou"],
        },
    ],
}

COLLAB_MARKDOWN = """# Couldn't Make

1.  $T:Asymmetric Love

    - $AC
    - [link](https://www.kompoz.com/studio/collaboration/1473518)
    - Original: And Chill

1.  $T:So Much

    - $AC
    - [link](https://www.kompoz.com/studio/collaboration/1470943)
    - Original: It's a long way from here to there

1.  $T:To This Café

    - $AC
    - [link](https://www.kompoz.com/studio/collaboration/1476399)
    - Original: Date Yourself
"""

SOLO_ALBUM = {
    "title": "Solo Work",
    "playlist": [
        # A variant marker on the title: the lyrics file has none.
        {
            "url": "/music/files/Solo Work/Dead Love.mp3",
            "title": "Dead Love*",
            "authors": ["Jean Lazarou"],
        },
        # A title that is a whole word inside another track's title, so
        # ranking between an exact and a partial match can be observed.
        {
            "url": "/music/files/Solo Work/Love.mp3",
            "title": "Love",
            "authors": ["Jean Lazarou"],
        },
        # Audio deliberately absent, to exercise the missing-file paths.
        {
            "url": "/music/files/Solo Work/Ghost.mp3",
            "title": "Ghost Track",
            "authors": ["Jean Lazarou"],
        },
    ],
}

SO_MUCH_LYRICS = """1
00:00:09,860 --> 00:00:11,350
She gave me so much

2
00:00:14,560 --> 00:00:16,560
I can't hope anything more
"""

# Shares the word 'much' with So Much's title but not its phrasing, so a
# lyrics hit and a title hit can be told apart.
DEAD_LOVE_LYRICS = """1
00:00:04,000 --> 00:00:06,000
It hurts too much tonight
"""


@pytest.fixture
def config(tmp_path: Path) -> Config:
    data_dir = tmp_path / "data"
    lyrics_dir = data_dir / "lyrics"
    lyrics_dir.mkdir(parents=True)

    (data_dir / "albums.json").write_text(json.dumps(ALBUMS), encoding="utf-8")
    (data_dir / "couldn-t-make.json").write_text(json.dumps(COLLAB_ALBUM), encoding="utf-8")
    (data_dir / "couldn-t-make.md").write_text(COLLAB_MARKDOWN, encoding="utf-8")
    (data_dir / "solo-work.json").write_text(json.dumps(SOLO_ALBUM), encoding="utf-8")
    (lyrics_dir / "So Much.srt").write_text(SO_MUCH_LYRICS, encoding="utf-8")
    (lyrics_dir / "Dead Love.srt").write_text(DEAD_LOVE_LYRICS, encoding="utf-8")

    music_dir = tmp_path / "music"
    for album, files in {
        "Couldn't Make": ["And Chill.mp3", "It's a long way.mp3", "Date Yourself.mp3"],
        "Solo Work": ["Dead Love.mp3", "Love.mp3"],
    }.items():
        folder = music_dir / album
        folder.mkdir(parents=True)
        for name in files:
            (folder / name).write_bytes(b"fake audio " + name.encode())

    return Config(data_dir=data_dir, music_dir=music_dir)


@pytest.fixture
def library(config: Config):
    return load_library(config)


@pytest.fixture
def tracks(library):
    return library.tracks
