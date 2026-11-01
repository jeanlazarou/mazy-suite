#
# Repair a forced alignment using a free transcription of the same audio.
#
# The two passes fail in different ways, which is what makes combining them
# worth the extra run. Forced alignment knows exactly *what* is sung but is
# bound to place every line somewhere, in order, so once it drifts it cannot
# recover — see docs/how-it-works.md. Free transcription gets the words
# wrong on songs, but it is under no obligation to account for a lyrics
# line, so where it does hear something its timing is independent evidence.
#
# So: match the lyrics against the transcript by text, keep the matches that
# look solid, and use them as control points to re-warp the alignment.
# Between two control points the draft's own shape is preserved; it is only
# stretched or shifted to meet them. A stretch of lines the aligner crammed
# into one second gets spread back over the span the transcript says they
# occupy.
#

import re
from difflib import SequenceMatcher

GAP_PENALTY = -0.2  # cost of leaving a line or a heard segment unmatched
MIN_SCORE = 0.45  # below this a text match is not evidence of anything


def normalise(text):
    """Lowercase, drop punctuation, collapse runs of whitespace."""
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


def similarity(left, right):
    left, right = normalise(left), normalise(right)

    if not left or not right:
        return 0.0

    return SequenceMatcher(None, left, right).ratio()


def match_lines(lyrics_lines, heard_texts, gap=GAP_PENALTY):
    """Monotonically pair lyrics lines with transcript segments.

    Needleman-Wunsch over text similarity. Monotonic because both
    sequences are in singing order: the transcript may miss lines or
    invent them, but it cannot reorder them.

    Returns [(lyric_index, heard_index, score)], in order.
    """
    rows, columns = len(lyrics_lines), len(heard_texts)

    scores = [[0.0] * (columns + 1) for _ in range(rows + 1)]
    for i in range(1, rows + 1):
        scores[i][0] = scores[i - 1][0] + gap
    for j in range(1, columns + 1):
        scores[0][j] = scores[0][j - 1] + gap

    for i in range(1, rows + 1):
        for j in range(1, columns + 1):
            hit = scores[i - 1][j - 1] + similarity(
                lyrics_lines[i - 1], heard_texts[j - 1]
            )
            scores[i][j] = max(hit, scores[i - 1][j] + gap, scores[i][j - 1] + gap)

    pairs = []
    i, j = rows, columns

    while i > 0 and j > 0:
        hit = scores[i - 1][j - 1] + similarity(
            lyrics_lines[i - 1], heard_texts[j - 1]
        )
        if scores[i][j] == hit:
            pairs.append((i - 1, j - 1, similarity(
                lyrics_lines[i - 1], heard_texts[j - 1]
            )))
            i, j = i - 1, j - 1
        elif scores[i][j] == scores[i - 1][j] + gap:
            i -= 1
        else:
            j -= 1

    return list(reversed(pairs))


def control_points(segments, lyrics_lines, heard, min_score=MIN_SCORE):
    """Pick the matches solid enough to move a region for.

    Returns [(lyric_index, heard_start)], strictly increasing in both,
    which is what the re-warp below needs to stay monotonic.
    """
    points = []

    for line_index, heard_index, score in match_lines(
        lyrics_lines, [text for _, _, text in heard]
    ):
        if score < min_score:
            continue

        start = heard[heard_index][0]

        # keep both axes increasing; a match that would go backwards is
        # a repeated lyric matching the wrong occurrence
        if points and start <= points[-1][1]:
            continue

        points.append((line_index, start))

    return points


def rewarp(segments, points):
    """Re-map segment times so anchored lines land on their heard time.

    Between consecutive control points the draft is rescaled linearly, so
    local spacing the aligner got right is preserved. Where the draft
    collapsed — control points far apart in time but the draft barely
    moving — the rescale spreads those lines back out. Outside the outer
    control points the draft is shifted, not stretched, since there is no
    second point to scale against.
    """
    if not points:
        return segments

    anchored = dict(points)

    def new_start(index):
        if index in anchored:
            return anchored[index]

        before = [p for p in points if p[0] < index]
        after = [p for p in points if p[0] > index]

        if before and after:
            (i0, t0), (i1, t1) = before[-1], after[0]
            f0, f1 = segments[i0][0], segments[i1][0]

            if f1 - f0 > 1e-6:
                return t0 + (segments[index][0] - f0) * (t1 - t0) / (f1 - f0)

            # the draft collapsed across this span: spread evenly
            return t0 + (index - i0) * (t1 - t0) / max(i1 - i0, 1)

        i0, t0 = before[-1] if before else after[0]

        return segments[index][0] + (t0 - segments[i0][0])

    return [
        (new_start(i), new_start(i) + (end - start), text)
        for i, (start, end, text) in enumerate(segments)
    ]


def count_in_silence(segments, voiced):
    """How many regions contain no voiced frame at all.

    The only quality signal available without a corrected file to
    compare against. Across the 15 songs measured so far it flagged 81
    genuinely misplaced regions against 4 false alarms, which is enough
    to choose between two drafts of the same song.
    """
    from .trim import FRAME

    total = len(voiced)

    return sum(
        1
        for start, end, _ in segments
        if not voiced[
            max(int(start / FRAME), 0) : min(int(end / FRAME) + 1, total)
        ].any()
    )


def better_draft(original, rewarped, voiced):
    """Keep the re-warp only when it leaves fewer regions in silence.

    Anchoring is not a reliable improvement on its own — on the corpus
    it repaired some songs dramatically and made others worse. But the
    two drafts can be compared without any ground truth, and picking
    the one with fewer regions sitting in silence gets it right often
    enough to turn a coin flip into a gain.

    Returns (segments, label) where label says which was kept.
    """
    if voiced is None:
        return original, "original"

    if count_in_silence(rewarped, voiced) < count_in_silence(original, voiced):
        return rewarped, "anchored"

    return original, "original"


def anchor_segments(segments, lyrics_lines, heard, min_score=MIN_SCORE):
    """Full repair: find control points in the transcript, re-warp to them.

    Returns (segments, number_of_control_points) so the caller can report
    how much evidence the transcript actually supplied.
    """
    if not heard:
        return segments, 0

    points = control_points(segments, lyrics_lines, heard, min_score)

    return rewarp(segments, points), len(points)
