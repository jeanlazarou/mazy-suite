"""Loading: the three files per album have to end up on one track."""

from __future__ import annotations

from pathlib import Path

import pytest

from song_finder.config import Config
from song_finder.library import LibraryError, load_library, local_path_for, parse_markdown
from song_finder.lyrics import read_lyrics


def find(tracks, name):
    return next(track for track in tracks if track.name == name)


def test_loads_every_listed_album(library):
    assert [album.name for album in library.albums] == ["couldn-t-make", "solo-work"]
    assert len(library) == 6


def test_album_json_supplies_titles_and_original_file(tracks):
    track = find(tracks, "Asymmetric Love")

    assert track.original_file == "And Chill"
    assert track.album_title == "Couldn't Make"
    assert track.authors == ["Mikael Lindh", "Jean Lazarou"]
    assert track.creation_date == "2025/07/30"


def test_markdown_supplies_kompoz_id_and_full_original_title(tracks):
    track = find(tracks, "So Much")

    assert track.kompoz_id == "1470943"
    assert track.original_title == "It's a long way from here to there"
    assert track.kompoz_url == "https://www.kompoz.com/studio/collaboration/1470943"


def test_album_without_markdown_still_loads(tracks):
    track = find(tracks, "Dead Love")

    assert track.kompoz_id is None
    assert track.original_title is None


def test_variant_marker_is_stripped_from_the_name(tracks):
    track = find(tracks, "Dead Love")

    assert track.title == "Dead Love*"
    assert track.name == "Dead Love"
    # And the lyrics file, which carries no marker, is still found.
    assert track.has_lyrics


def test_lyrics_are_attached_when_present(tracks):
    assert "gave me so much" in find(tracks, "So Much").lyrics
    assert find(tracks, "Asymmetric Love").lyrics is None


def test_missing_audio_is_reported_not_dropped(tracks):
    ghost = find(tracks, "Ghost Track")

    assert not ghost.exists
    assert find(tracks, "Asymmetric Love").exists


def test_scratch_playlists_are_ignored(config: Config):
    """Only what albums.json lists counts as an album."""
    (config.data_dir / "temp.json").write_text('{"playlist": []}', encoding="utf-8")

    assert [album.name for album in load_library(config).albums] == [
        "couldn-t-make",
        "solo-work",
    ]


def test_missing_album_file_warns_and_carries_on(config: Config):
    (config.data_dir / "albums.json").write_text(
        '[{"name": "couldn-t-make"}, {"name": "nope"}]', encoding="utf-8"
    )

    library = load_library(config)

    assert len(library.albums) == 1
    assert any("nope" in warning for warning in library.warnings)


def test_unreadable_albums_file_is_an_error(config: Config):
    (config.data_dir / "albums.json").write_text("{}", encoding="utf-8")

    with pytest.raises(LibraryError):
        load_library(config)


class TestMarkdown:
    def test_block_runs_until_the_next_track(self):
        entries = parse_markdown(
            "1. $T:First\n"
            "   - [link](https://www.kompoz.com/studio/collaboration/111)\n"
            "   - Original: One\n"
            "1. $T:Second\n"
            "   - Original: Two\n"
        )

        assert entries["First"].kompoz_id == "111"
        assert entries["First"].original_title == "One"
        assert entries["Second"].kompoz_id is None
        assert entries["Second"].original_title == "Two"

    def test_escaped_marker_is_a_literal(self):
        entries = parse_markdown("1. $T:Waking Room\\*\n   - Original: Thing\n")

        assert "Waking Room" in entries

    def test_text_before_the_first_track_is_ignored(self):
        entries = parse_markdown("# Album\n\nOriginal: not a track\n\n1. $T:Real\n")

        assert list(entries) == ["Real"]


class TestPaths:
    def test_served_prefix_maps_to_the_music_folder(self):
        path = local_path_for("/music/files/Couldn't Make/And Chill.mp3", Path("/music"))

        assert path == Path("/music/Couldn't Make/And Chill.mp3")

    def test_other_urls_are_taken_as_relative(self):
        assert local_path_for("odd/Track.mp3", Path("/music")) == Path("/music/odd/Track.mp3")


class TestLyricsReader:
    def test_keeps_only_the_text(self, tmp_path: Path):
        srt = tmp_path / "a.srt"
        srt.write_text("1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n\nWorld\n", encoding="utf-8")

        assert read_lyrics(srt) == "Hello\nWorld"

    def test_unreadable_file_yields_nothing(self, tmp_path: Path):
        assert read_lyrics(tmp_path / "missing.srt") == ""
