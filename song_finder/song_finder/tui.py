"""The interactive browser.

Type in the search box, the list narrows as you go. Space marks tracks, ``c``
copies everything marked to a folder of your choosing — renamed to the song
title unless you say otherwise.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from rich.markup import escape
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.coordinate import Coordinate
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    Checkbox,
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    RadioButton,
    RadioSet,
    Static,
)

from .config import Config
from .export import Naming, copy_tracks
from .library import load_library
from .models import Track
from .search import Match, search

SELECTED_MARK = "●"


def track_key(track: Track) -> str:
    """Stable identity for a track across searches."""
    return f"{track.album_name}/{track.title}"


@dataclass
class CopyOptions:
    output: Path
    naming: Naming
    with_lyrics: bool
    by_album: bool


class CopyScreen(ModalScreen):
    """Ask where to copy the selection, and under what names."""

    BINDINGS = [Binding("escape", "cancel", "Cancel")]

    def __init__(self, count: int, default_output: str = "") -> None:
        super().__init__()
        self._count = count
        self._default_output = default_output

    def compose(self) -> ComposeResult:
        with Vertical(id="copy-dialog"):
            yield Label(f"Copy {self._count} track(s) to:", id="copy-title")
            yield Input(
                value=self._default_output,
                placeholder="~/Desktop/selection",
                id="copy-output",
            )
            yield Label("Name the copies after:")
            with RadioSet(id="copy-naming"):
                yield RadioButton("The song title", value=True)
                yield RadioButton("The original collaboration file")
                yield RadioButton("Track number + song title")
            yield Checkbox("Also copy lyrics (.srt)", id="copy-lyrics")
            yield Checkbox("Keep album sub-folders", id="copy-by-album")
            with Horizontal(id="copy-buttons"):
                yield Button("Copy", variant="primary", id="copy-confirm")
                yield Button("Cancel", id="copy-cancel")

    def on_mount(self) -> None:
        self.query_one("#copy-output", Input).focus()

    def action_cancel(self) -> None:
        self.dismiss(None)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "copy-cancel":
            self.dismiss(None)
            return
        self._confirm()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self._confirm()

    def _confirm(self) -> None:
        destination = self.query_one("#copy-output", Input).value.strip()
        if not destination:
            self.query_one("#copy-title", Label).update("Give a destination folder:")
            return

        naming = [Naming.TITLE, Naming.ORIGINAL, Naming.NUMBERED][
            self.query_one("#copy-naming", RadioSet).pressed_index or 0
        ]

        self.dismiss(
            CopyOptions(
                output=Path(destination).expanduser(),
                naming=naming,
                with_lyrics=self.query_one("#copy-lyrics", Checkbox).value,
                by_album=self.query_one("#copy-by-album", Checkbox).value,
            )
        )


class SongFinderApp(App):
    """Search the library, mark tracks, copy them out."""

    TITLE = "song finder"

    CSS = """
    /* Header and Footer dock themselves; everything else stacks in between,
       so nothing here may dock or it lands on top of the footer. */
    #search { height: 3; }
    #body { height: 1fr; }
    #results { width: 2fr; height: 1fr; }
    #detail { width: 1fr; height: 1fr; border-left: solid $panel; padding: 0 1; }
    #status { height: 1; padding: 0 1; background: $panel; color: $text-muted; }

    CopyScreen { align: center middle; }
    #copy-dialog {
        width: 64;
        height: auto;
        padding: 1 2;
        background: $surface;
        border: thick $primary;
    }
    #copy-title { padding-bottom: 1; }
    #copy-buttons { height: auto; padding-top: 1; }
    #copy-buttons Button { margin-right: 2; }
    """

    BINDINGS = [
        Binding("ctrl+c", "quit", "Quit", priority=True),
        Binding("escape", "clear_search", "Clear"),
        Binding("space", "toggle_select", "Mark", show=True),
        Binding("a", "select_all", "Mark all"),
        Binding("x", "clear_selection", "Unmark all"),
        Binding("c", "copy", "Copy…"),
        Binding("r", "reveal", "Reveal"),
        Binding("slash", "focus_search", "Search"),
    ]

    def __init__(self, config: Config, initial_query: str = "") -> None:
        super().__init__()
        self._config = config
        self._initial_query = initial_query
        self._tracks: List[Track] = []
        self._matches: List[Match] = []
        self._selected: Dict[str, Track] = {}
        self._last_output = ""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Input(
            placeholder='song, original name, author, lyrics…  (author:brae, lyrics:"never again")',
            id="search",
        )
        with Horizontal(id="body"):
            yield DataTable(id="results", cursor_type="row", zebra_stripes=True)
            with VerticalScroll(id="detail"):
                yield Static("", id="detail-text")
        yield Static("", id="status")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one("#results", DataTable)
        # Fixed widths so the columns line up while scrolling; kept tight
        # enough that Authors still gets room on a normal terminal.
        table.add_column(" ", key="mark", width=1)
        table.add_column("Song", key="song", width=24)
        table.add_column("Album", key="album", width=16)
        table.add_column("Original file", key="original", width=20)
        table.add_column("Authors", key="authors")

        library = load_library(self._config)
        self._tracks = library.tracks

        search_input = self.query_one("#search", Input)
        search_input.value = self._initial_query
        search_input.focus()

        self._run_search(self._initial_query)

    # ------------------------------------------------------------------ search

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == "search":
            self._run_search(event.value)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "search":
            self.query_one("#results", DataTable).focus()

    def _run_search(self, query: str) -> None:
        self._matches = search(self._tracks, query)
        self._refill_table()
        self._update_status()

    def _refill_table(self) -> None:
        table = self.query_one("#results", DataTable)
        table.clear()

        for match in self._matches:
            track = match.track
            key = track_key(track)
            table.add_row(
                SELECTED_MARK if key in self._selected else "",
                escape(track.name) if track.exists else f"[dim]{escape(track.name)}[/dim]",
                escape(track.album_title),
                escape(track.original_file),
                escape(track.authors_line),
                key=key,
            )

        self._show_detail(self._matches[0] if self._matches else None)

    # ------------------------------------------------------------------ detail

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if 0 <= event.cursor_row < len(self._matches):
            self._show_detail(self._matches[event.cursor_row])

    def _show_detail(self, match: Optional[Match]) -> None:
        detail = self.query_one("#detail-text", Static)

        if match is None:
            detail.update("[dim]no match[/dim]")
            return

        track = match.track
        lines = [f"[bold cyan]{escape(track.name)}[/bold cyan]", ""]
        lines.append(f"[dim]album[/dim]     {escape(track.album_title)}")
        lines.append(f"[dim]original[/dim]  [green]{escape(track.original_file)}[/green]")

        if track.original_title and track.original_title != track.original_file:
            lines.append(f"[dim]full name[/dim] {escape(track.original_title)}")
        if track.authors:
            lines.append(f"[dim]authors[/dim]   {escape(track.authors_line)}")
        if track.creation_date:
            lines.append(f"[dim]created[/dim]   {track.creation_date}")
        if track.kompoz_id:
            lines.append(f"[dim]kompoz[/dim]    {track.kompoz_id}")

        state = "" if track.exists else "  [red](missing)[/red]"
        lines.append(f"[dim]file[/dim]      {escape(str(track.local_path))}{state}")
        lines.append(f"[dim]renamed[/dim]   [cyan]{escape(track.renamed_to_title)}[/cyan]")

        if track.lyrics:
            lines.extend(["", "[dim]lyrics[/dim]", escape(track.lyrics)])

        detail.update("\n".join(lines))

    def _update_status(self, message: str = "") -> None:
        parts = [f"{len(self._matches)}/{len(self._tracks)} tracks"]
        if self._selected:
            parts.append(f"{len(self._selected)} marked")
        if message:
            parts.append(message)
        self.query_one("#status", Static).update("   ".join(parts))

    # ----------------------------------------------------------------- actions

    def _current(self) -> Optional[Match]:
        table = self.query_one("#results", DataTable)
        row = table.cursor_row
        if 0 <= row < len(self._matches):
            return self._matches[row]
        return None

    def action_focus_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_clear_search(self) -> None:
        search_input = self.query_one("#search", Input)
        if search_input.value:
            search_input.value = ""
        search_input.focus()

    def action_toggle_select(self) -> None:
        match = self._current()
        if match is None:
            return

        table = self.query_one("#results", DataTable)
        row = table.cursor_row
        key = track_key(match.track)

        if key in self._selected:
            del self._selected[key]
            mark = ""
        else:
            self._selected[key] = match.track
            mark = SELECTED_MARK

        table.update_cell_at(Coordinate(row, 0), mark)
        table.action_cursor_down()
        self._update_status()

    def action_select_all(self) -> None:
        for match in self._matches:
            self._selected[track_key(match.track)] = match.track
        self._refill_table()
        self._update_status()

    def action_clear_selection(self) -> None:
        self._selected.clear()
        self._refill_table()
        self._update_status()

    def action_reveal(self) -> None:
        """Show the highlighted track's file in the system file manager."""
        match = self._current()
        if match is None or not match.track.exists:
            self._update_status("nothing to reveal")
            return

        if sys.platform != "darwin":
            self._update_status(str(match.track.local_path))
            return

        subprocess.run(["open", "-R", str(match.track.local_path)], check=False)

    def action_copy(self) -> None:
        tracks = list(self._selected.values())
        if not tracks:
            match = self._current()
            if match is None:
                self._update_status("nothing to copy")
                return
            tracks = [match.track]

        def done(options: Optional[CopyOptions]) -> None:
            if options is None:
                return
            self._copy(tracks, options)

        self.push_screen(CopyScreen(len(tracks), self._last_output), done)

    def _copy(self, tracks: List[Track], options: CopyOptions) -> None:
        report = copy_tracks(
            tracks,
            output_dir=options.output,
            naming=options.naming,
            with_lyrics=options.with_lyrics,
            by_album=options.by_album,
        )

        self._last_output = str(options.output)
        self._update_status(f"{report.summary()} → {options.output}")

        if not report.problems:
            self._selected.clear()
            self._refill_table()


def run_tui(config: Config, initial_query: str = "") -> int:
    SongFinderApp(config, initial_query).run()
    return 0
