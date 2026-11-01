#
# Tell the user when a draft looks wrong, before they open the editor.
#
# The aligner cannot report its own failures usefully: it must place every
# line somewhere, in order, so when it loses sync it still returns a
# complete, legal, confidently-wrong answer. But two fingerprints of that
# failure survive into the finished file and cost nothing to look for.
#
#   - A run of regions packed at exactly min_gap, most of them sitting at
#     exactly min_duration. That is the invariant pass legalising a heap of
#     degenerate segments; nothing a human would sing produces it.
#   - A region containing no voiced audio at all. Measured over 628 regions
#     this flagged 81 genuinely misplaced regions against 4 false alarms.
#
# Neither is a guarantee — a quiet draft can still be wrong — so these are
# reported as "look here", never as "this is fine".
#

TOLERANCE = 0.005


def _timestamp(seconds):
    return f"{int(seconds) // 60}:{int(seconds) % 60:02d}"


def at_minimum_duration(segments, indexes, min_duration):
    return sum(
        1
        for i in indexes
        if abs((segments[i][1] - segments[i][0]) - min_duration) < TOLERANCE
    )


def collapsed_runs(segments, min_duration=0.2, min_gap=0.02, minimum=3):
    """Find runs of regions packed at exactly min_gap.

    The gap chain alone is not enough: consecutive sung lines with no pause
    between them also get pushed to exactly min_gap, and that is a correct
    result. Duration separates the two — a collapsed region had no voiced
    audio to close it either, so it sits at min_duration, while abutting
    real lines keep their full length.
    """
    runs = []
    run = []

    for i in range(1, len(segments)):
        if abs((segments[i][0] - segments[i - 1][1]) - min_gap) < TOLERANCE:
            run = run or [i - 1]
            run.append(i)
        elif run:
            runs.append(run)
            run = []

    if run:
        runs.append(run)

    return [
        r
        for r in runs
        if len(r) >= minimum
        and at_minimum_duration(segments, r, min_duration) >= max(2, len(r) / 2)
    ]


def regions_in_silence(segments, voiced, frame):
    """Indexes of regions that contain no voiced frame at all."""
    total = len(voiced)

    return [
        i
        for i, (start, end, _) in enumerate(segments)
        if not voiced[
            max(int(start / frame), 0) : min(int(end / frame) + 1, total)
        ].any()
    ]


def regions_without_audio(segments, silent, frame):
    """Indexes of regions whose whole span is digital silence.

    Stronger than "quiet": a recorded stem has a noise floor, so exact
    zeros mean no track was playing at all there.

    It does *not* follow that the export is wrong. A DAW writes zeros
    wherever no track plays, so a vocal stem is typically half digital
    silence with runs of a minute — measured across this corpus, every
    stem was 40-74% zeros with gaps up to 90 s, all of them correct. A
    region landing on zeros is therefore usually a misplaced region, and
    only occasionally a missing track. The two cannot be told apart
    without knowing where the line really belongs, so this reports the
    observation and leaves the cause open.
    """
    total = len(silent)

    return [
        i
        for i, (start, end, _) in enumerate(segments)
        if silent[
            max(int(start / frame), 0) : min(int(end / frame) + 1, total)
        ].all()
    ]


def audit_corrected(segments, lines, silent=None, frame=0.02):
    """Problems with a *corrected* file, the one used as ground truth.

    The other checks here read a draft, where a bad region means the
    aligner lost sync. This one reads the file a human saved, where the
    same shapes mean something different: the ground truth itself is
    wrong, and anything measured against it is wrong too.

    Two checks, and the order matters because they catch different
    faults. Counts disagreeing means lines were added or lost while
    editing. But a corrupt line present in *both* files agrees with
    itself and passes that check — so the second one asks the audio
    instead: a corrected region whose whole span is digital silence is a
    line the singer never sang there, which no amount of careful editing
    would produce.
    """
    notes = []

    if len(segments) != len(lines):
        notes.append(
            f"{len(lines)} lyrics lines against {len(segments)} entries; "
            f"lines were added or lost while editing"
        )

    if silent is not None:
        empty = regions_without_audio(segments, silent, frame)

        if empty:
            where = ", ".join(
                f"entry {i + 1} {segments[i][2].strip()!r}" for i in empty[:4]
            )
            more = "" if len(empty) <= 4 else f", +{len(empty) - 4} more"
            notes.append(
                f"{len(empty)} of {len(segments)} corrected regions have no "
                f"audio under them: {where}{more}"
            )

    return notes


def warnings(segments, voiced=None, frame=0.02, min_duration=0.2, min_gap=0.02,
             silent=None):
    """Human-readable notes about a finished draft. Empty when it looks sane.

    Each note names where to look, because the point is to save the user
    hunting for the damage rather than to grade the file.
    """
    notes = []

    for run in collapsed_runs(segments, min_duration, min_gap):
        first, last = run[0], run[-1]
        span = segments[last][1] - segments[first][0]
        notes.append(
            f"entries {first + 1}-{last + 1} look collapsed: {len(run)} regions "
            f"packed into {span:.1f}s around {_timestamp(segments[first][0])}"
        )

    if voiced is not None:
        quiet = regions_in_silence(segments, voiced, frame)

        if quiet:
            where = ", ".join(_timestamp(segments[i][0]) for i in quiet[:4])
            more = "" if len(quiet) <= 4 else f", +{len(quiet) - 4} more"
            note = (
                f"{len(quiet)} of {len(segments)} regions sit where nothing "
                f"is sung: {where}{more}"
            )

            # a region on exact zeros is the same observation, but when most
            # of the song is like that the stem itself is the likelier cause
            if silent is not None:
                empty = regions_without_audio(segments, silent, frame)

                if len(empty) / len(segments) >= 0.4:
                    note += (
                        f" — {len(empty)} of them have no audio at all, which "
                        f"is most of the song, so check the stem was exported "
                        f"with every vocal track unmuted"
                    )

            notes.append(note)

    return notes
