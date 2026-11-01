from srt_generator.anchor import (
    anchor_segments,
    better_draft,
    control_points,
    count_in_silence,
    match_lines,
    normalise,
    rewarp,
    similarity,
)


def test_normalise_strips_punctuation_and_case():
    assert normalise("Don't  TURN, your back!") == "don t turn your back"


def test_similarity_is_one_for_the_same_line_differently_written():
    assert similarity("Turn your back", "turn your back!") == 1.0


def test_similarity_is_low_for_unrelated_lines():
    assert similarity("Night eyes", "I have a meeting today") < 0.45


def test_match_lines_pairs_in_order():
    lyrics = ["first line", "second line", "third line"]
    heard = ["first line", "second line", "third line"]

    assert [(i, j) for i, j, _ in match_lines(lyrics, heard)] == [
        (0, 0), (1, 1), (2, 2)
    ]


def test_match_lines_tolerates_a_missing_transcript_segment():
    # the transcriber never heard the middle line
    lyrics = ["alpha bravo", "charlie delta", "echo foxtrot"]
    heard = ["alpha bravo", "echo foxtrot"]

    pairs = [(i, j) for i, j, s in match_lines(lyrics, heard) if s > 0.45]

    assert pairs == [(0, 0), (2, 1)]


def test_control_points_skip_weak_matches():
    lyrics = ["alpha bravo", "nothing like it"]
    heard = [(10.0, 11.0, "alpha bravo"), (20.0, 21.0, "zzzz qqqq")]

    points = control_points(None, lyrics, heard)

    assert points == [(0, 10.0)]


def test_control_points_never_go_backwards():
    # a repeated lyric can match an earlier occurrence; that pairing is
    # dropped rather than allowed to invert the timeline
    lyrics = ["same words", "same words"]
    heard = [(50.0, 51.0, "same words"), (10.0, 11.0, "same words")]

    points = control_points(None, lyrics, heard)

    assert [t for _, t in points] == sorted(t for _, t in points)


def test_rewarp_without_points_changes_nothing():
    segments = [(1.0, 2.0, "a"), (3.0, 4.0, "b")]

    assert rewarp(segments, []) == segments


def test_rewarp_shifts_when_there_is_one_point():
    segments = [(90.0, 91.0, "a"), (92.0, 93.0, "b")]

    result = rewarp(segments, [(0, 45.0)])

    assert result[0][0] == 45.0
    # spacing is preserved, the whole thing just moves
    assert round(result[1][0] - result[0][0], 6) == 2.0


def test_rewarp_rescales_between_two_points():
    # draft says 10 and 20; transcript says those lines are at 100 and 200
    segments = [(10.0, 11.0, "a"), (15.0, 16.0, "b"), (20.0, 21.0, "c")]

    result = rewarp(segments, [(0, 100.0), (2, 200.0)])

    assert result[0][0] == 100.0
    assert result[2][0] == 200.0
    assert result[1][0] == 150.0


def test_rewarp_spreads_a_collapsed_run():
    # the aligner crammed three lines into 40 ms; the transcript puts the
    # outer two 60 s apart, so the middle one belongs between them
    segments = [(100.0, 100.2, "a"), (100.22, 100.42, "b"), (100.44, 100.64, "c")]

    result = rewarp(segments, [(0, 100.0), (2, 160.0)])

    assert result[0][0] == 100.0
    assert result[2][0] == 160.0
    assert 100.0 < result[1][0] < 160.0


def test_rewarp_keeps_durations():
    segments = [(10.0, 12.5, "a"), (20.0, 21.0, "b")]

    result = rewarp(segments, [(0, 50.0)])

    assert round(result[0][1] - result[0][0], 6) == 2.5
    assert round(result[1][1] - result[1][0], 6) == 1.0


def test_anchor_segments_without_a_transcript_is_a_no_op():
    segments = [(1.0, 2.0, "a")]

    assert anchor_segments(segments, ["a"], []) == (segments, 0)


def test_anchor_segments_reports_how_many_points_it_used():
    segments = [(90.0, 91.0, "a smile"), (92.0, 93.0, "behind a glass door")]
    heard = [(44.5, 45.1, "a smile"), (45.7, 47.5, "behind a glass door")]

    result, used = anchor_segments(segments, ["a smile", "behind a glass door"], heard)

    assert used == 2
    assert round(result[0][0], 2) == 44.5


def voiced_between(total_seconds, spans):
    """Boolean frame array, True inside the given (start, end) spans."""
    import numpy as np

    from srt_generator.trim import FRAME

    frames = np.zeros(int(total_seconds / FRAME), dtype=bool)
    for start, end in spans:
        frames[int(start / FRAME) : int(end / FRAME)] = True

    return frames


def test_count_in_silence_counts_regions_with_no_voice():
    voiced = voiced_between(20, [(1.0, 2.0), (10.0, 11.0)])
    segments = [(1.0, 2.0, "on voice"), (5.0, 6.0, "in silence"),
                (10.2, 10.8, "on voice"), (15.0, 16.0, "in silence")]

    assert count_in_silence(segments, voiced) == 2


def test_better_draft_prefers_fewer_regions_in_silence():
    voiced = voiced_between(20, [(10.0, 12.0)])
    original = [(1.0, 2.0, "a")]          # in silence
    rewarped = [(10.2, 11.0, "a")]        # on the voice

    assert better_draft(original, rewarped, voiced) == (rewarped, "anchored")


def test_better_draft_keeps_the_original_when_anchoring_is_no_better():
    voiced = voiced_between(20, [(10.0, 12.0)])
    original = [(10.2, 11.0, "a")]
    rewarped = [(1.0, 2.0, "a")]          # moved into silence

    assert better_draft(original, rewarped, voiced) == (original, "original")


def test_better_draft_keeps_the_original_on_a_tie():
    # no evidence either way: do not disturb the alignment
    voiced = voiced_between(20, [(10.0, 12.0)])
    original = [(10.2, 11.0, "a")]
    rewarped = [(10.5, 11.2, "a")]

    assert better_draft(original, rewarped, voiced)[1] == "original"


def test_better_draft_keeps_the_original_without_a_voiced_map():
    assert better_draft([(1.0, 2.0, "a")], [(5.0, 6.0, "a")], None)[1] == "original"
