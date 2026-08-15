"""Copying a selection out to a folder.

The point of the whole tool: take the tracks you found and put them somewhere,
named after the song rather than after the collaboration file they were mixed
to. Nothing here ever touches the library — it only reads from it.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Iterable, List, Optional

from .models import Track

# Characters that cannot go in a file name (or make one awkward to handle).
_UNSAFE = re.compile(r'[/\\:*?"<>|\x00-\x1f]')
_RUNS = re.compile(r"-{2,}")


class Naming(str, Enum):
    """What to call the copies."""

    TITLE = "title"
    """The song title — ``And Chill.mp3`` becomes ``Asymmetric Love.mp3``."""

    ORIGINAL = "original"
    """Leave the collaboration file name alone."""

    NUMBERED = "numbered"
    """The song title behind its playlist position: ``04 - Asymmetric Love.mp3``."""


class Status(str, Enum):
    COPIED = "copied"
    SKIPPED = "skipped"
    MISSING = "missing"
    FAILED = "failed"


@dataclass
class Result:
    """What happened to one track."""

    track: Track
    status: Status
    destination: Optional[Path] = None
    detail: str = ""

    @property
    def ok(self) -> bool:
        return self.status is Status.COPIED


@dataclass
class Report:
    results: List[Result]
    dry_run: bool = False

    @property
    def copied(self) -> List[Result]:
        return [result for result in self.results if result.status is Status.COPIED]

    @property
    def problems(self) -> List[Result]:
        return [
            result for result in self.results if result.status in (Status.MISSING, Status.FAILED)
        ]

    @property
    def skipped(self) -> List[Result]:
        return [result for result in self.results if result.status is Status.SKIPPED]

    def summary(self) -> str:
        verb = "would copy" if self.dry_run else "copied"
        parts = [f"{verb} {len(self.copied)}"]
        if self.skipped:
            parts.append(f"skipped {len(self.skipped)}")
        if self.problems:
            parts.append(f"failed {len(self.problems)}")
        return ", ".join(parts)


def safe_name(name: str) -> str:
    """Make ``name`` usable as a file name, keeping it readable.

    Replacing one character at a time leaves debris — ``"AC/DC: live?"`` would
    become ``"AC-DC- live-"`` — so runs are collapsed and the edges tidied.
    """
    cleaned = _RUNS.sub("-", _UNSAFE.sub("-", name))
    cleaned = cleaned.strip().strip(".-").strip()
    return cleaned or "untitled"


def destination_name(track: Track, naming: Naming) -> str:
    """File name a copy of ``track`` gets under ``naming``."""
    suffix = track.local_path.suffix or ".mp3"

    if naming is Naming.ORIGINAL:
        return safe_name(track.original_file) + suffix
    if naming is Naming.NUMBERED:
        return safe_name(f"{track.track_number:02d} - {track.name}") + suffix

    return safe_name(track.name) + suffix


def _unique(path: Path, taken: Iterable[Path]) -> Path:
    """A path that collides with neither the disk nor this run's earlier copies."""
    claimed = set(taken)
    if not path.exists() and path not in claimed:
        return path

    stem, suffix = path.stem, path.suffix
    for index in range(2, 1000):
        candidate = path.with_name(f"{stem} ({index}){suffix}")
        if not candidate.exists() and candidate not in claimed:
            return candidate

    raise OSError(f"cannot find a free name for {path.name}")


def copy_tracks(
    tracks: Iterable[Track],
    output_dir: Path,
    naming: Naming = Naming.TITLE,
    with_lyrics: bool = False,
    by_album: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
) -> Report:
    """Copy ``tracks`` into ``output_dir``.

    ``by_album`` keeps the album folders; otherwise everything lands flat.
    Existing files are left alone and the copy gets a ``(2)`` suffix, unless
    ``overwrite`` says to replace them.
    """
    output_dir = Path(output_dir).expanduser()
    results: List[Result] = []
    claimed: List[Path] = []

    for track in tracks:
        source = track.local_path

        if not source.is_file():
            results.append(Result(track, Status.MISSING, detail=f"no file at {source}"))
            continue

        target_dir = output_dir / safe_name(track.album_title) if by_album else output_dir
        target = target_dir / destination_name(track, naming)

        try:
            if not overwrite:
                if target.exists() and target.samefile(source):
                    results.append(Result(track, Status.SKIPPED, target, "already there"))
                    continue
                target = _unique(target, claimed)

            claimed.append(target)

            if not dry_run:
                target_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)

                if with_lyrics and track.lyrics_path and track.lyrics_path.is_file():
                    shutil.copy2(track.lyrics_path, target.with_suffix(".srt"))

            results.append(Result(track, Status.COPIED, target))
        except OSError as error:
            results.append(Result(track, Status.FAILED, target, str(error)))

    return Report(results=results, dry_run=dry_run)
