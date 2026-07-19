import numpy as np

from srt_generator.trim import FRAME, _trim_to_voiced


def voiced_between(total_seconds, spans):
    """Boolean frame array, True inside the given (start, end) spans."""
    frames = np.zeros(int(total_seconds / FRAME), dtype=bool)

    for start, end in spans:
        frames[int(start / FRAME) : int(end / FRAME)] = True

    return frames


def test_trims_end_back_to_silence():
    # singing stops at 3.0 but the aligner stretched the segment to 6.0
    voiced = voiced_between(10, [(1.0, 3.0)])

    result = _trim_to_voiced(voiced, [(1.0, 6.0, "line")], pad=0.1, min_duration=0.2)

    _, end, _ = result[0]
    assert end <= 3.0 + 0.1 + FRAME
    assert end >= 3.0 - FRAME


def test_trims_start_forward_to_voice():
    voiced = voiced_between(10, [(2.0, 3.0)])

    result = _trim_to_voiced(voiced, [(0.5, 3.0, "line")], pad=0.1, min_duration=0.2)

    start, _, _ = result[0]
    assert start >= 2.0 - 0.1 - FRAME
    assert start <= 2.0 + FRAME


def test_never_grows_edges():
    # voice extends beyond the segment on both sides
    voiced = voiced_between(10, [(0.0, 10.0)])

    result = _trim_to_voiced(voiced, [(2.0, 4.0, "line")], pad=0.5, min_duration=0.2)

    assert result[0][:2] == (2.0, 4.0)


def test_silent_segment_left_untouched():
    voiced = voiced_between(10, [(8.0, 9.0)])

    result = _trim_to_voiced(voiced, [(1.0, 2.0, "line")], pad=0.1, min_duration=0.2)

    assert result[0][:2] == (1.0, 2.0)


def test_internal_silences_kept_by_default():
    # a wrong cut drops real singing, which is harder to fix in
    # player_editor than dragging in an over-long edge — so regions are
    # only closed at internal silences when max_gap is explicitly given
    voiced = voiced_between(140, [(107.7, 110.1), (136.0, 138.0)])

    result = _trim_to_voiced(
        voiced, [(107.74, 136.28, "line")], pad=0.12, min_duration=0.2
    )

    _, end, _ = result[0]
    assert end >= 136.0


def test_max_gap_closes_region_at_long_internal_silence():
    # "The Gravity" entry 16: real singing 107.7-110.1, then 26s of
    # silence, then the next line's voice right at the segment end —
    # edge-trimming alone cannot shrink it
    voiced = voiced_between(140, [(107.7, 110.1), (136.0, 138.0)])

    result = _trim_to_voiced(
        voiced, [(107.74, 136.28, "line")], pad=0.12, min_duration=0.2, max_gap=1.0
    )

    start, end, _ = result[0]
    assert start >= 107.7 - 0.12 - FRAME
    assert end <= 110.1 + 0.12 + FRAME
    assert end >= 110.1 - FRAME


def test_breath_pauses_shorter_than_max_gap_are_kept():
    voiced = voiced_between(10, [(1.0, 2.0), (2.5, 3.5)])

    result = _trim_to_voiced(
        voiced, [(1.0, 3.5, "line")], pad=0.0, min_duration=0.2, max_gap=1.0
    )

    _, end, _ = result[0]
    assert end >= 3.5 - FRAME


def test_skips_trim_that_would_be_too_short():
    # only a single voiced blip inside a long segment
    voiced = voiced_between(10, [(2.0, 2.04)])

    result = _trim_to_voiced(voiced, [(1.0, 6.0, "line")], pad=0.0, min_duration=0.5)

    assert result[0][:2] == (1.0, 6.0)
