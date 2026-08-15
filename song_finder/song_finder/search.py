"""Matching a query against the library.

A query is whitespace separated terms, ANDed together: every term has to match
somewhere for a track to be a result. A term is either bare, and then it is
tried against every field, or scoped with ``field:term``::

    asymmetric                 anywhere
    author:brae chasing        by author, and 'chasing' anywhere
    lyrics:"never again"       a phrase in the lyrics
    orig:chill                 by the collaboration file name
    id:1473518                 by kompoz collaboration id

Scoring reflects how the match was made: a hit on the song title outranks one
in the lyrics, and a whole-field match outranks a substring buried in it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .models import FIELD_ALIASES, SEARCHABLE_FIELDS, SQUEEZABLE_FIELDS, Track
from .text import fold, normalize, squeeze

_TOKEN = re.compile(
    r"""(?:([A-Za-z]+):)?(?:"([^"]*)"|'([^']*)'|(\S+))""",
)

#: How much a match in each field counts.
FIELD_WEIGHTS: Dict[str, float] = {
    "title": 100.0,
    "kompoz": 90.0,
    "original": 80.0,
    "author": 50.0,
    "lyrics": 40.0,
    "album": 30.0,
    "date": 20.0,
}

# How well the term fits the field: the whole of it, its start, a whole word
# inside it, or just a substring.
_EXACT = 3.0
_PREFIX = 2.0
_WORD = 1.5
_SUBSTRING = 1.0
# A run-together match ('asymmetriclove'), only tried when nothing else hit.
_SQUEEZED = 0.8


@dataclass(frozen=True)
class Term:
    """One parsed query term."""

    text: str
    """Normalised text to look for."""

    field: Optional[str] = None
    """Field to restrict to, or ``None`` to try them all."""

    raw: str = ""


@dataclass
class Match:
    """A track that matched, and how."""

    track: Track
    score: float
    fields: List[str] = field(default_factory=list)
    """Fields that contributed, best first."""

    snippet: str = ""
    """The lyrics line that matched, when the match came from the lyrics."""

    @property
    def matched_lyrics(self) -> bool:
        return "lyrics" in self.fields


def parse_query(query: str) -> List[Term]:
    """Split a query into terms, honouring ``field:`` scopes and quotes."""
    terms: List[Term] = []

    for match in _TOKEN.finditer(query):
        prefix, double, single, bare = match.groups()
        value = next(part for part in (double, single, bare) if part is not None)

        scope = None
        if prefix:
            scope = FIELD_ALIASES.get(prefix.lower())
            if scope is None:
                # Not a field name — the colon was part of the text.
                value = match.group(0)

        text = normalize(value)
        if not text:
            continue

        terms.append(Term(text=text, field=scope, raw=value))

    return terms


def _quality(value: str, term: str) -> Optional[float]:
    """How good a match ``term`` is inside ``value``, or ``None`` if absent."""
    if not value or term not in value:
        return None

    if value == term:
        return _EXACT
    if value.startswith(term):
        return _PREFIX

    position = value.find(term)
    while position != -1:
        if position == 0 or value[position - 1] == " ":
            return _WORD
        position = value.find(term, position + 1)

    return _SUBSTRING


def _score_term(track: Track, term: Term) -> Tuple[float, List[str]]:
    """Best score this term reaches on this track, and the fields that got there."""
    fields: Sequence[str] = (term.field,) if term.field else SEARCHABLE_FIELDS

    best = 0.0
    matched: List[Tuple[float, str]] = []

    for name in fields:
        quality = _quality(track.indexed(name), term.text)
        if quality is None:
            continue
        score = FIELD_WEIGHTS.get(name, 10.0) * quality
        matched.append((score, name))
        best = max(best, score)

    if matched:
        matched.sort(reverse=True)
        return best, [name for _, name in matched]

    # Nothing yet: allow 'asymmetriclove' to find 'Asymmetric Love', and
    # 'couldnt' to find "Couldn't Make".
    squeezed = term.text.replace(" ", "")
    if squeezed:
        for name in SQUEEZABLE_FIELDS:
            if term.field and term.field != name:
                continue
            if squeezed in track.indexed(f"_squeezed_{name}"):
                return FIELD_WEIGHTS[name] * _SQUEEZED, [name]

    return 0.0, []


def _lyrics_snippet(track: Track, terms: Iterable[Term]) -> str:
    """First lyrics line containing one of the terms."""
    if not track.lyrics:
        return ""

    wanted = [term.text for term in terms if term.text]
    for line in track.lyrics.splitlines():
        folded = normalize(line)
        for term in wanted:
            if term in folded:
                return line.strip()

    return ""


def search(
    tracks: Iterable[Track],
    query: str,
    limit: Optional[int] = None,
) -> List[Match]:
    """Rank ``tracks`` against ``query``; an empty query returns everything."""
    terms = parse_query(query)
    matches: List[Match] = []

    if not terms:
        matches = [Match(track=track, score=0.0) for track in tracks]
    else:
        for track in tracks:
            total = 0.0
            fields: List[str] = []

            for term in terms:
                score, matched = _score_term(track, term)
                if not matched:
                    # Every term has to land somewhere.
                    total = 0.0
                    fields = []
                    break
                total += score
                for name in matched:
                    if name not in fields:
                        fields.append(name)

            if fields:
                snippet = _lyrics_snippet(track, terms) if "lyrics" in fields else ""
                matches.append(Match(track=track, score=total, fields=fields, snippet=snippet))

    matches.sort(key=lambda match: (-match.score, fold(match.track.name)))

    if limit is not None:
        return matches[:limit]

    return matches


def identify(tracks: Iterable[Track], candidate: str) -> List[Match]:
    """Work out which song an audio file is, from its name or path.

    Tries the file name against the collaboration name first — that is what a
    stray mp3 in a project folder is normally called — then the song title,
    then falls back to a general search.
    """
    stem = normalize(re.sub(r"\.[A-Za-z0-9]+$", "", candidate.rsplit("/", 1)[-1]))
    if not stem:
        return []

    exact: List[Match] = []
    for track in tracks:
        if stem == track.indexed("original"):
            exact.append(Match(track=track, score=1000.0, fields=["original"]))
        elif stem == track.indexed("title"):
            exact.append(Match(track=track, score=900.0, fields=["title"]))
        elif stem == normalize(track.original_file):
            exact.append(Match(track=track, score=950.0, fields=["original"]))
        elif squeeze(stem) and squeeze(stem) == squeeze(track.original_file):
            exact.append(Match(track=track, score=800.0, fields=["original"]))

    if exact:
        exact.sort(key=lambda match: (-match.score, fold(match.track.name)))
        return exact

    return search(tracks, stem)
