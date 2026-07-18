#
# Turns raw aligner/transcriber segments into an SRT file that
# player_editor's srt_parser.js accepts:
#   - IDs are exactly 1, 2, 3, ...
#   - every segment has from < to (hard error otherwise)
#   - start and end times strictly increase (warning otherwise)
#   - timestamps formatted HH:MM:SS,mmm with comma decimals
#   - blocks separated by a single blank line, "\n" line endings
#

EPSILON = 0.01


def postprocess(segments, min_duration=0.2, min_gap=0.02):
    """Clean up (start, end, text) tuples so they satisfy the parser.

    Aligners routinely emit zero-length or overlapping segments on fast
    passages; this nudges them into a strictly increasing, non-degenerate
    sequence while staying as close as possible to the original times.
    """
    cleaned = [
        (start, end, text.strip())
        for start, end, text in segments
        if text.strip()
    ]
    cleaned.sort(key=lambda seg: seg[0])

    result = []
    prev_start = None
    prev_end = None

    for start, end, text in cleaned:
        if start < 0:
            start = 0.0
        if prev_start is not None and start <= prev_start:
            start = prev_start + EPSILON
        if end < start + min_duration:
            end = start + min_duration
        if prev_end is not None and end <= prev_end:
            end = prev_end + EPSILON

        result.append((start, end, text))
        prev_start, prev_end = start, end

    for i in range(len(result) - 1):
        start, end, text = result[i]
        next_start = result[i + 1][0]

        if end > next_start - min_gap and next_start - min_gap > start:
            result[i] = (start, next_start - min_gap, text)

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
