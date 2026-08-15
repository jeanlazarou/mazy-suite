"""Reading the text out of an SRT file.

Only the spoken text is wanted here — timings are irrelevant to searching — so
this reader is deliberately more forgiving than the suite's strict parsers: a
malformed cue costs a line of lyrics, never a failed search.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List

_TIMING = re.compile(r"-->")
_INDEX = re.compile(r"^\d+$")


def read_lyrics(path: Path) -> str:
    """Return the cue text of an SRT file as plain lines, blanks collapsed."""
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return ""

    lines: List[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or _INDEX.match(stripped) or _TIMING.search(stripped):
            continue
        lines.append(stripped)

    return "\n".join(lines)
