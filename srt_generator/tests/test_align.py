import pytest

from srt_generator.align import LyricsCountMismatch, pair_with_lyrics


def test_pairs_timings_with_lines_in_order():
    result = pair_with_lyrics([(1.0, 2.0), (3.0, 4.0)], ["first", "second"])

    assert result == [(1.0, 2.0, "first"), (3.0, 4.0, "second")]


def test_text_comes_from_the_lyrics_file_not_the_model():
    # the aligner echoes its own normalisation back (case, punctuation);
    # the file is the source of truth for what is sung
    result = pair_with_lyrics([(1.0, 2.0)], ["Don't turn your back"])

    assert result[0][2] == "Don't turn your back"


def test_rejects_a_short_alignment():
    # one missing segment does not cost one bad region — player_editor binds
    # by position, so every line after it lands on the wrong region
    with pytest.raises(LyricsCountMismatch):
        pair_with_lyrics([(1.0, 2.0)], ["first", "second"])


def test_rejects_a_long_alignment():
    with pytest.raises(LyricsCountMismatch):
        pair_with_lyrics([(1.0, 2.0), (3.0, 4.0)], ["only one"])


def test_mismatch_message_names_both_counts():
    with pytest.raises(
        LyricsCountMismatch, match=r"2 segments for 3 lyrics lines"
    ):
        pair_with_lyrics([(1.0, 2.0), (3.0, 4.0)], ["a", "b", "c"])


def test_empty_alignment_of_empty_lyrics_is_not_a_mismatch():
    assert pair_with_lyrics([], []) == []
