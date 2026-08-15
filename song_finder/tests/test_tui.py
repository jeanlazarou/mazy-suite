"""The interactive browser, driven headless.

Textual's test pilot is async; each scenario is run through ``asyncio.run`` so
the suite needs no async plugin.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from textual.widgets import DataTable, Input

from song_finder.config import Config
from song_finder.tui import CopyScreen, SongFinderApp, track_key


def drive(scenario):
    """Run an async pilot scenario from a plain test."""
    asyncio.run(scenario())


def results(app: SongFinderApp) -> DataTable:
    return app.query_one("#results", DataTable)


def test_opens_with_the_whole_library(config: Config):
    async def scenario():
        app = SongFinderApp(config)
        async with app.run_test() as pilot:
            await pilot.pause()

            assert results(app).row_count == 6

    drive(scenario)


def test_typing_narrows_the_list(config: Config):
    async def scenario():
        app = SongFinderApp(config)
        async with app.run_test() as pilot:
            await pilot.pause()
            await pilot.press("a", "s", "y", "m")
            await pilot.pause()

            assert results(app).row_count == 1
            assert app._matches[0].track.name == "Asymmetric Love"

    drive(scenario)


def test_starts_from_an_initial_query(config: Config):
    async def scenario():
        app = SongFinderApp(config, initial_query="author:lindh")
        async with app.run_test() as pilot:
            await pilot.pause()

            assert [match.track.name for match in app._matches] == ["Asymmetric Love"]

    drive(scenario)


def test_escape_clears_the_search(config: Config):
    async def scenario():
        app = SongFinderApp(config, initial_query="asym")
        async with app.run_test() as pilot:
            await pilot.pause()
            await pilot.press("escape")
            await pilot.pause()

            assert app.query_one("#search", Input).value == ""
            assert results(app).row_count == 6

    drive(scenario)


def test_marking_a_track_and_unmarking_it(config: Config):
    async def scenario():
        app = SongFinderApp(config, initial_query="asym")
        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("space")
            await pilot.pause()

            assert [track.name for track in app._selected.values()] == ["Asymmetric Love"]

            # The cursor moved on after marking, so come back to it.
            results(app).move_cursor(row=0)
            await pilot.press("space")
            await pilot.pause()

            assert app._selected == {}

    drive(scenario)


def test_mark_all_then_clear(config: Config):
    async def scenario():
        app = SongFinderApp(config, initial_query="album:couldnt")
        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("a")
            await pilot.pause()

            assert len(app._selected) == 3

            await pilot.press("x")
            await pilot.pause()

            assert app._selected == {}

    drive(scenario)


def test_selection_survives_a_new_search(config: Config):
    """Marks are kept across queries, so a selection can be built up."""

    async def scenario():
        app = SongFinderApp(config, initial_query="asym")
        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("space")
            await pilot.pause()

            app.query_one("#search", Input).value = "dead"
            await pilot.pause()
            results(app).focus()
            await pilot.press("space")
            await pilot.pause()

            assert sorted(track.name for track in app._selected.values()) == [
                "Asymmetric Love",
                "Dead Love",
            ]

    drive(scenario)


def test_copying_the_selection(config: Config, tmp_path: Path):
    async def scenario():
        destination = tmp_path / "exported"
        app = SongFinderApp(config, initial_query="album:couldnt")

        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("a")
            await pilot.pause()

            await pilot.press("c")
            await pilot.pause()
            assert isinstance(app.screen, CopyScreen)

            app.screen.query_one("#copy-output", Input).value = str(destination)
            await pilot.click("#copy-confirm")
            await pilot.pause()

            assert sorted(path.name for path in destination.iterdir()) == [
                "Asymmetric Love.mp3",
                "So Much.mp3",
                "To This Café.mp3",
            ]
            # A clean copy clears the marks.
            assert app._selected == {}

    drive(scenario)


def test_cancelling_the_copy_writes_nothing(config: Config, tmp_path: Path):
    async def scenario():
        app = SongFinderApp(config, initial_query="asym")

        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("c")
            await pilot.pause()

            app.screen.query_one("#copy-output", Input).value = str(tmp_path / "nope")
            await pilot.press("escape")
            await pilot.pause()

            assert not (tmp_path / "nope").exists()

    drive(scenario)


def test_copy_falls_back_to_the_highlighted_track(config: Config, tmp_path: Path):
    """With nothing marked, copying takes what the cursor is on."""

    async def scenario():
        destination = tmp_path / "one"
        app = SongFinderApp(config, initial_query="asym")

        async with app.run_test() as pilot:
            await pilot.pause()
            results(app).focus()
            await pilot.press("c")
            await pilot.pause()

            app.screen.query_one("#copy-output", Input).value = str(destination)
            await pilot.click("#copy-confirm")
            await pilot.pause()

            assert [path.name for path in destination.iterdir()] == ["Asymmetric Love.mp3"]

    drive(scenario)


def test_track_key_separates_same_titled_songs_on_different_albums(tracks):
    keys = {track_key(track) for track in tracks}

    assert len(keys) == len(tracks)
