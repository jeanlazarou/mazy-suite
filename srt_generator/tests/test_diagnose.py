import numpy as np

from srt_generator.diagnose import (
    audit_corrected,
    collapsed_runs,
    regions_in_silence,
    regions_without_audio,
    warnings,
)
from srt_generator.trim import FRAME


def chain(start, count, duration=0.2, gap=0.02):
    """A run of regions packed exactly at min_gap, as postprocess leaves them."""
    segments = []
    t = start
    for i in range(count):
        segments.append((t, t + duration, f"line {i}"))
        t = t + duration + gap
    return segments


def voiced_between(total_seconds, spans):
    frames = np.zeros(int(total_seconds / FRAME), dtype=bool)
    for start, end in spans:
        frames[int(start / FRAME) : int(end / FRAME)] = True
    return frames


def test_finds_a_collapsed_run():
    runs = collapsed_runs(chain(100.0, 6))

    assert len(runs) == 1
    assert runs[0] == [0, 1, 2, 3, 4, 5]


def test_ignores_a_short_chain():
    # two abutting regions are ordinary, not a collapse
    assert collapsed_runs(chain(100.0, 2)) == []


def test_ignores_abutting_full_length_lines():
    # the false positive found on "Slaves and Masters": real consecutive
    # lines with no pause, pushed to min_gap but keeping their length
    segments = [
        (32.98, 37.84, "a"),
        (37.86, 41.84, "b"),
        (41.86, 42.70, "c"),
    ]

    assert collapsed_runs(segments) == []


def test_regions_in_silence_finds_the_unsung_ones():
    voiced = voiced_between(30, [(1.0, 2.0), (10.0, 11.0)])
    segments = [(1.0, 2.0, "a"), (5.0, 6.0, "b"), (10.2, 10.8, "c"), (20.0, 21.0, "d")]

    assert regions_in_silence(segments, voiced, FRAME) == [1, 3]


def test_no_warnings_for_a_healthy_draft():
    voiced = voiced_between(30, [(1.0, 2.0), (5.0, 6.0)])
    segments = [(1.0, 2.0, "a"), (5.0, 6.0, "b")]

    assert warnings(segments, voiced) == []


def test_warning_names_the_entries_and_the_time():
    notes = warnings(chain(122.0, 6))

    assert len(notes) == 1
    assert "entries 1-6" in notes[0]
    assert "2:02" in notes[0]


def test_warning_counts_regions_in_silence():
    voiced = voiced_between(60, [(1.0, 2.0)])
    segments = [(1.0, 2.0, "on voice"), (30.0, 31.0, "silent"), (40.0, 41.0, "silent")]

    note = next(n for n in warnings(segments, voiced) if "nothing" in n)

    assert "2 of 3 regions" in note
    assert "0:30" in note


def test_silence_warning_is_skipped_without_a_voiced_map():
    segments = [(1.0, 2.0, "a"), (30.0, 31.0, "b")]

    assert warnings(segments, None) == []


def silent_outside(total_seconds, spans):
    """Digital-silence frames: True everywhere except the given spans."""
    import numpy as np

    from srt_generator.trim import FRAME

    frames = np.ones(int(total_seconds / FRAME), dtype=bool)
    for start, end in spans:
        frames[int(start / FRAME) : int(end / FRAME)] = False

    return frames


def test_regions_without_audio_finds_the_empty_ones():
    silent = silent_outside(30, [(1.0, 5.0)])
    segments = [(1.0, 2.0, "on audio"), (10.0, 11.0, "no audio"), (20.0, 21.0, "no audio")]

    assert regions_without_audio(segments, silent, FRAME) == [1, 2]


def test_a_region_partly_on_audio_is_not_flagged():
    # half a region over silence is a trim problem, not a missing track
    silent = silent_outside(30, [(1.0, 5.0)])

    assert regions_without_audio([(4.0, 8.0, "half")], silent, FRAME) == []


def test_a_few_empty_regions_are_reported_without_blaming_the_export():
    # one region on zeros among several is ordinary: the DAW writes zeros
    # wherever no track plays, so this is almost always a bad placement
    silent = silent_outside(30, [(1.0, 10.0)])
    voiced = voiced_between(30, [(1.0, 10.0)])
    segments = [(1.0, 2.0, "a"), (3.0, 4.0, "b"), (5.0, 6.0, "c"),
                (7.0, 8.0, "d"), (20.0, 21.0, "empty")]

    note = next(n for n in warnings(segments, voiced, silent=silent)
                if "nothing is sung" in n)

    assert "1 of 5 regions" in note
    assert "unmuted" not in note


def test_mostly_empty_points_at_the_export():
    silent = silent_outside(60, [(1.0, 3.0)])
    voiced = voiced_between(60, [(1.0, 3.0)])
    segments = [(1.0, 2.0, "on audio"), (30.0, 31.0, "empty"),
                (40.0, 41.0, "empty"), (50.0, 51.0, "empty")]

    note = next(n for n in warnings(segments, voiced, silent=silent)
                if "nothing is sung" in n)

    assert "3 of 4 regions" in note
    assert "no audio at all" in note
    assert "unmuted" in note


def test_one_note_per_problem_not_two():
    # the empty-audio observation extends the silence note rather than
    # repeating the same regions as a second warning
    silent = silent_outside(60, [(1.0, 3.0)])
    voiced = voiced_between(60, [(1.0, 3.0)])
    segments = [(1.0, 2.0, "a"), (30.0, 31.0, "b"), (40.0, 41.0, "c")]

    assert sum(1 for n in warnings(segments, voiced, silent=silent)
               if "regions sit" in n) == 1


def test_no_export_warning_when_every_region_has_audio():
    silent = silent_outside(30, [(0.0, 30.0)])
    voiced = voiced_between(30, [(1.0, 5.0)])

    assert warnings([(1.0, 2.0, "a")], voiced, silent=silent) == []


def test_a_sound_corrected_file_has_nothing_to_report():
    silent = silent_outside(30, [(0.0, 30.0)])
    segments = [(1.0, 2.0, "a"), (3.0, 4.0, "b")]

    assert audit_corrected(segments, ["a", "b"], silent=silent, frame=FRAME) == []


def test_audit_reports_a_count_mismatch():
    # the "July 27" shape: the editor appended a region with no lyrics line,
    # so the corrected file has one entry more than the lyrics
    segments = [(1.0, 2.0, "a"), (3.0, 4.0, "b"), (5.0, 5.2, "undefined")]

    note = audit_corrected(segments, ["a", "b"])[0]

    assert "2 lyrics lines against 3 entries" in note


def test_audit_catches_a_corrupt_line_the_counts_agree_on():
    # the "Going Circle" shape, and the reason counts are not enough: the
    # spurious line is in the lyrics *and* the SRT, so they agree — only the
    # audio shows that nothing was ever sung there
    silent = silent_outside(30, [(0.0, 6.0)])
    segments = [(1.0, 2.0, "a"), (3.0, 4.0, "b"), (20.0, 20.2, "undefined")]
    lines = ["a", "b", "undefined"]

    notes = audit_corrected(segments, lines, silent=silent, frame=FRAME)

    assert not any("lyrics lines against" in n for n in notes)
    assert "1 of 3 corrected regions have no audio" in notes[0]
    assert "entry 3 'undefined'" in notes[0]
