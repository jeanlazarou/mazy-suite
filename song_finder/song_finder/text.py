"""Text normalisation shared by the indexer and the matcher.

Searching has to survive the difference between what you remember and what got
typed: accents (``To This Café``), apostrophes (``Couldn't Make``,
``It's a long way``) and punctuation generally.
"""

from __future__ import annotations

import re
import unicodedata

# Trailing * or + on a playlist title marks a variant; it is not part of the
# name, and the lyrics file is named without it.
VARIANT_MARKERS = "*+"

_SEPARATORS = re.compile(r"[^0-9a-z]+")


def strip_variant_marker(title: str) -> str:
    """``"Hand in the Air (final)+"`` -> ``"Hand in the Air (final)"``."""
    return title.rstrip(VARIANT_MARKERS).strip()


def fold(text: str) -> str:
    """Casefold and drop diacritics, keeping the original spacing."""
    decomposed = unicodedata.normalize("NFKD", text)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return without_marks.casefold()


def normalize(text: str) -> str:
    """Fold, then reduce every run of punctuation to a single space.

    Both the indexed values and the query go through this, so ``couldnt make``
    matches ``Couldn't Make`` and ``to this cafe`` matches ``To This Café``.
    """
    return _SEPARATORS.sub(" ", fold(text)).strip()


def squeeze(text: str) -> str:
    """Normalise and drop spaces too, for run-together queries."""
    return normalize(text).replace(" ", "")
