#
# Turns raw aligner/transcriber segments into an SRT file that
# player_editor's srt_parser.js accepts:
#   - IDs are exactly 1, 2, 3, ...
#   - every segment has from < to (hard error otherwise)
#   - start and end times strictly increase (warning otherwise)
#   - timestamps formatted HH:MM:SS,mmm with comma decimals
#   - blocks separated by a single blank line, "\n" line endings
#


def postprocess(segments, min_duration=0.2, min_gap=0.02, max_duration=None):
    """Clean up (start, end, text) tuples so they satisfy the parser.

    Aligners routinely emit zero-length, overlapping or wildly stretched
    segments on fast or repeated passages. A single forward pass turns
    them into a sequence that is guaranteed to be

      - non-overlapping, with at least min_gap between regions —
        player_editor reads one flat list of alternating from/to timings,
        so an overlap scrambles which line is highlighted;
      - min_duration long or longer, with start < end;
      - strictly increasing in both starts and ends;
      - at most max_duration long, when one is given.

    Regions are shaved from the end, which is the side aligners stretch;
    a start is only pushed forward when the end cannot be shaved without
    falling under min_duration.
    """
    cleaned = [
        (start, end, text.strip())
        for start, end, text in segments
        if text.strip()
    ]
    cleaned.sort(key=lambda seg: seg[0])

    result = []
    prev_end = None

    for i, (start, end, text) in enumerate(cleaned):
        start = max(start, 0.0)

        if prev_end is not None:
            start = max(start, prev_end + min_gap)

        if max_duration:
            end = min(end, start + max_duration)

        # shave against the *raw* next start: the following segment has
        # not been placed yet, and it never moves earlier than that
        if i + 1 < len(cleaned):
            end = min(end, cleaned[i + 1][0] - min_gap)

        # last resort, when the next line starts inside min_duration:
        # keep the region legal and let the next start be pushed instead
        end = max(end, start + min_duration)

        result.append((start, end, text))
        prev_end = end

    return result


def format_timestamp(seconds):
    total_ms = round(seconds * 1000)

    ms = total_ms % 1000
    total_s = total_ms // 1000

    return f"{total_s // 3600:02d}:{total_s % 3600 // 60:02d}:{total_s % 60:02d},{ms:03d}"


def to_srt(segments):
    blocks = []

    for i, (start, end, text) in enumerate(segments, start=1):
        blocks.append(
            f"{i}\n{format_timestamp(start)} --> {format_timestamp(end)}\n{text}"
        )

    return "\n\n".join(blocks) + "\n"


def write_srt(segments, path):
    path.write_text(to_srt(segments), encoding="utf-8", newline="\n")
