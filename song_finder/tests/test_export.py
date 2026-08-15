"""Copying: the right bytes, under the right name, without losing anything."""

from __future__ import annotations

from pathlib import Path

from song_finder.export import Naming, Status, copy_tracks, destination_name, safe_name
from song_finder.search import search


def track(tracks, name):
    return next(item for item in tracks if item.name == name)


class TestNaming:
    def test_renames_to_the_song_title(self, tracks):
        assert destination_name(track(tracks, "Asymmetric Love"), Naming.TITLE) == (
            "Asymmetric Love.mp3"
        )

    def test_keeps_the_collaboration_name(self, tracks):
        assert (
            destination_name(track(tracks, "Asymmetric Love"), Naming.ORIGINAL) == "And Chill.mp3"
        )

    def test_numbers_by_playlist_position(self, tracks):
        assert destination_name(track(tracks, "To This Café"), Naming.NUMBERED) == (
            "03 - To This Café.mp3"
        )

    def test_variant_marker_never_reaches_the_file_name(self, tracks):
        assert destination_name(track(tracks, "Dead Love"), Naming.TITLE) == "Dead Love.mp3"

    def test_path_separators_are_neutralised(self):
        assert safe_name("AC/DC: live?") == "AC-DC- live"

    def test_runs_of_replacements_collapse(self):
        assert safe_name('Say <<"it">>') == "Say -it"

    def test_a_trailing_question_mark_just_goes(self):
        assert safe_name("Do U Hear Me?") == "Do U Hear Me"

    def test_a_name_that_sanitises_to_nothing_still_works(self):
        assert safe_name("...") == "untitled"


class TestCopying:
    def test_copies_the_bytes_under_the_song_title(self, tracks, tmp_path: Path):
        report = copy_tracks([track(tracks, "Asymmetric Love")], tmp_path / "out")

        assert report.copied
        copied = tmp_path / "out" / "Asymmetric Love.mp3"
        assert copied.read_bytes() == b"fake audio And Chill.mp3"

    def test_creates_the_destination(self, tracks, tmp_path: Path):
        copy_tracks([track(tracks, "So Much")], tmp_path / "deep" / "nested")

        assert (tmp_path / "deep" / "nested" / "So Much.mp3").is_file()

    def test_dry_run_writes_nothing(self, tracks, tmp_path: Path):
        report = copy_tracks([track(tracks, "So Much")], tmp_path / "out", dry_run=True)

        assert len(report.copied) == 1
        assert not (tmp_path / "out").exists()

    def test_missing_audio_is_reported_and_the_rest_proceeds(self, tracks, tmp_path: Path):
        report = copy_tracks(
            [track(tracks, "Ghost Track"), track(tracks, "So Much")], tmp_path / "out"
        )

        assert [result.status for result in report.results] == [Status.MISSING, Status.COPIED]
        assert (tmp_path / "out" / "So Much.mp3").is_file()

    def test_lyrics_travel_alongside_when_asked(self, tracks, tmp_path: Path):
        copy_tracks([track(tracks, "So Much")], tmp_path / "out", with_lyrics=True)

        assert "gave me so much" in (tmp_path / "out" / "So Much.srt").read_text(encoding="utf-8")

    def test_no_lyrics_file_is_not_a_failure(self, tracks, tmp_path: Path):
        report = copy_tracks([track(tracks, "Asymmetric Love")], tmp_path / "out", with_lyrics=True)

        assert report.copied
        assert not (tmp_path / "out" / "Asymmetric Love.srt").exists()

    def test_album_sub_folders_are_kept_on_request(self, tracks, tmp_path: Path):
        copy_tracks([track(tracks, "So Much")], tmp_path / "out", by_album=True)

        assert (tmp_path / "out" / "Couldn't Make" / "So Much.mp3").is_file()


class TestCollisions:
    def test_an_existing_file_is_never_clobbered(self, tracks, tmp_path: Path):
        output = tmp_path / "out"
        output.mkdir()
        (output / "So Much.mp3").write_bytes(b"something precious")

        copy_tracks([track(tracks, "So Much")], output)

        assert (output / "So Much.mp3").read_bytes() == b"something precious"
        assert (output / "So Much (2).mp3").is_file()

    def test_overwrite_replaces_it(self, tracks, tmp_path: Path):
        output = tmp_path / "out"
        output.mkdir()
        (output / "So Much.mp3").write_bytes(b"stale")

        copy_tracks([track(tracks, "So Much")], output, overwrite=True)

        assert (output / "So Much.mp3").read_bytes() == b"fake audio It's a long way.mp3"
        assert not (output / "So Much (2).mp3").exists()

    def test_two_tracks_wanting_one_name_both_survive(self, tracks, tmp_path: Path):
        """Distinct songs can share a title; neither copy may be lost."""
        first = track(tracks, "So Much")
        second = track(tracks, "Asymmetric Love")
        second.name = "So Much"

        copy_tracks([first, second], tmp_path / "out")

        assert (tmp_path / "out" / "So Much.mp3").is_file()
        assert (tmp_path / "out" / "So Much (2).mp3").is_file()


class TestReport:
    def test_summary_counts_what_happened(self, tracks, tmp_path: Path):
        report = copy_tracks(
            [track(tracks, "So Much"), track(tracks, "Ghost Track")], tmp_path / "out"
        )

        assert "copied 1" in report.summary()
        assert "failed 1" in report.summary()

    def test_copying_a_whole_search_result(self, tracks, tmp_path: Path):
        matches = search(tracks, "album:couldnt")

        report = copy_tracks([match.track for match in matches], tmp_path / "out")

        assert len(report.copied) == 3
        assert sorted(path.name for path in (tmp_path / "out").iterdir()) == [
            "Asymmetric Love.mp3",
            "So Much.mp3",
            "To This Café.mp3",
        ]
