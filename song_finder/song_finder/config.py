"""Locating the library on disk.

Two paths matter:

``data_dir``
    The shared mazy_suite ``data/`` folder: ``albums.json``, one
    ``<album>.json`` and ``<album>.md`` per album, and ``lyrics/<Title>.srt``.

``music_dir``
    Where the audio actually lives locally. Playlist urls are served paths
    (``/music/files/<Album>/<file>.mp3``); locally the same tree sits under
    ``music_dir`` (``~/Music/projects/<Album>/<file>.mp3``).

Resolution order for both: explicit argument, environment variable, config
file, then the built-in default.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

DATA_DIR_ENV = "MAZY_DATA_DIR"
MUSIC_DIR_ENV = "MAZY_MUSIC_DIR"

CONFIG_FILE = Path.home() / ".config" / "mazy" / "song_finder.json"

DEFAULT_MUSIC_DIR = Path.home() / "Music" / "projects"

# Playlist urls are rooted here; everything after it is the local sub-path.
SERVED_MUSIC_PREFIX = "/music/files/"


class ConfigError(Exception):
    """The library could not be located."""


@dataclass(frozen=True)
class Config:
    data_dir: Path
    music_dir: Path

    @property
    def albums_file(self) -> Path:
        return self.data_dir / "albums.json"

    @property
    def lyrics_dir(self) -> Path:
        return self.data_dir / "lyrics"


def _read_config_file() -> dict:
    try:
        with CONFIG_FILE.open(encoding="utf-8") as stream:
            content = json.load(stream)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as error:
        raise ConfigError(f"cannot read {CONFIG_FILE}: {error}") from error

    if not isinstance(content, dict):
        raise ConfigError(f"{CONFIG_FILE} must contain a JSON object")

    return content


def find_data_dir(start: Optional[Path] = None) -> Optional[Path]:
    """Walk up from ``start`` looking for a suite checkout's ``data/`` folder.

    Recognises it by ``albums.json``, so an unrelated ``data`` directory on the
    way up is skipped rather than picked by mistake.
    """
    candidates = []
    if start is not None:
        candidates.append(Path(start).resolve())
    candidates.append(Path.cwd().resolve())
    # The package normally lives in <suite>/song_finder/song_finder/.
    candidates.append(Path(__file__).resolve().parent)

    for candidate in candidates:
        for directory in [candidate, *candidate.parents]:
            data_dir = directory / "data"
            if (data_dir / "albums.json").is_file():
                return data_dir

    return None


def load_config(
    data_dir: Optional[Path] = None,
    music_dir: Optional[Path] = None,
    start: Optional[Path] = None,
) -> Config:
    """Resolve both library paths, or explain what is missing."""
    stored = _read_config_file()

    resolved_data = data_dir
    if resolved_data is None and os.environ.get(DATA_DIR_ENV):
        resolved_data = Path(os.environ[DATA_DIR_ENV])
    if resolved_data is None and stored.get("data_dir"):
        resolved_data = Path(stored["data_dir"]).expanduser()
    if resolved_data is None:
        resolved_data = find_data_dir(start)

    if resolved_data is None:
        raise ConfigError(
            "cannot find the mazy_suite data folder.\n"
            f"Run from inside the suite, set {DATA_DIR_ENV}, pass --data-dir, "
            f'or add "data_dir" to {CONFIG_FILE}.'
        )

    resolved_data = Path(resolved_data).expanduser().resolve()
    if not (resolved_data / "albums.json").is_file():
        raise ConfigError(f"{resolved_data} has no albums.json")

    resolved_music = music_dir
    if resolved_music is None and os.environ.get(MUSIC_DIR_ENV):
        resolved_music = Path(os.environ[MUSIC_DIR_ENV])
    if resolved_music is None and stored.get("music_dir"):
        resolved_music = Path(stored["music_dir"]).expanduser()
    if resolved_music is None:
        resolved_music = DEFAULT_MUSIC_DIR

    return Config(data_dir=resolved_data, music_dir=Path(resolved_music).expanduser())
