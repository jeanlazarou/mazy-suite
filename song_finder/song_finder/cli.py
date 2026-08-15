"""Command line entry point.

With no arguments it opens the TUI; the sub-commands cover the same ground for
scripting and one-off questions.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional, Sequence

from rich.console import Console
from rich.table import Table

from . import __version__
from .config import Config, ConfigError, load_config
from .export import Naming, Status, copy_tracks, destination_name
from .library import Library, LibraryError, load_library
from .models import Track
from .search import Match, identify, search

console = Console()
errors = Console(stderr=True)


def _library(args: argparse.Namespace) -> Library:
    config = load_config(data_dir=args.data_dir, music_dir=args.music_dir)
    library = load_library(config)

    if args.verbose:
        for warning in library.warnings:
            errors.print(f"[yellow]warning[/yellow] {warning}")

    return library


def _matches(library: Library, query: Sequence[str], limit: Optional[int]) -> List[Match]:
    return search(library.tracks, " ".join(query), limit=limit)


def _results_table(matches: Sequence[Match], show_score: bool = False) -> Table:
    table = Table(box=None, pad_edge=False, header_style="bold")
    table.add_column("Song", style="bold cyan", no_wrap=True)
    table.add_column("Album", style="magenta", no_wrap=True)
    table.add_column("Original file", style="green")
    table.add_column("Authors", style="dim", no_wrap=True)
    table.add_column("", style="dim", no_wrap=True)
    if show_score:
        table.add_column("Score", justify="right", style="dim")

    for match in matches:
        track = match.track
        flags = ""
        flags += "♪" if track.has_lyrics else " "
        flags += "" if track.exists else " ✗"

        row = [
            track.name,
            track.album_title,
            track.original_file,
            track.authors_line,
            flags,
        ]
        if show_score:
            row.append(f"{match.score:.0f}")

        table.add_row(*row)

    return table


def _print_matches(matches: Sequence[Match], show_score: bool) -> None:
    if not matches:
        console.print("[dim]no match[/dim]")
        return

    console.print(_results_table(matches, show_score))

    snippets = [match for match in matches if match.snippet]
    if snippets:
        console.print()
        for match in snippets[:10]:
            console.print(f"  [cyan]{match.track.name}[/cyan] — [dim]{match.snippet}[/dim]")

    console.print(f"\n[dim]{len(matches)} result(s)[/dim]")


def _print_track(track: Track) -> None:
    console.print(f"[bold cyan]{track.name}[/bold cyan]")
    console.print(f"  album      {track.album_title}")
    console.print(f"  original   {track.original_file}")
    if track.original_title and track.original_title != track.original_file:
        console.print(f"  full name  {track.original_title}")
    if track.authors:
        console.print(f"  authors    {track.authors_line}")
    if track.creation_date:
        console.print(f"  created    {track.creation_date}")
    if track.kompoz_url:
        console.print(f"  kompoz     {track.kompoz_url}")

    marker = "" if track.exists else " [red](missing)[/red]"
    console.print(f"  file       {track.local_path}{marker}")

    if track.lyrics:
        console.print("\n[dim]lyrics[/dim]")
        for line in track.lyrics.splitlines():
            console.print(f"  {line}")


def command_search(args: argparse.Namespace) -> int:
    library = _library(args)
    matches = _matches(library, args.query, args.limit)

    if args.json:
        console.print_json(data=[match.track.as_dict() for match in matches])
        return 0

    _print_matches(matches, show_score=args.score)
    return 0 if matches else 1


def command_show(args: argparse.Namespace) -> int:
    library = _library(args)
    matches = _matches(library, args.query, limit=None)

    if not matches:
        errors.print("[red]no match[/red]")
        return 1

    if args.json:
        console.print_json(data=matches[0].track.as_dict())
        return 0

    _print_track(matches[0].track)

    if len(matches) > 1:
        console.print(f"\n[dim]{len(matches) - 1} other match(es); refine the query[/dim]")

    return 0


def command_identify(args: argparse.Namespace) -> int:
    library = _library(args)
    matches = identify(library.tracks, args.file)

    if args.json:
        console.print_json(data=[match.track.as_dict() for match in matches])
        return 0

    if not matches:
        errors.print(f"[red]no song matches[/red] {args.file}")
        return 1

    _print_track(matches[0].track)

    if len(matches) > 1:
        console.print("\n[dim]other candidates[/dim]")
        console.print(_results_table(matches[1:]))

    return 0


def command_copy(args: argparse.Namespace) -> int:
    library = _library(args)
    matches = _matches(library, args.query, args.limit)

    if not matches:
        errors.print("[red]no match, nothing to copy[/red]")
        return 1

    naming = Naming(args.rename)
    tracks = [match.track for match in matches]

    console.print(
        f"[bold]{'Would copy' if args.dry_run else 'Copying'}[/bold] "
        f"{len(tracks)} track(s) to {args.output}\n"
    )
    for track in tracks:
        console.print(
            f"  [green]{track.original_file}[/green] → [cyan]{destination_name(track, naming)}[/cyan]"
        )

    report = copy_tracks(
        tracks,
        output_dir=args.output,
        naming=naming,
        with_lyrics=args.lyrics,
        by_album=args.by_album,
        overwrite=args.overwrite,
        dry_run=args.dry_run,
    )

    for result in report.problems:
        errors.print(f"[red]{result.status.value}[/red] {result.track.name}: {result.detail}")
    for result in report.skipped:
        console.print(f"[yellow]skipped[/yellow] {result.track.name}: {result.detail}")

    console.print(f"\n[bold]{report.summary()}[/bold]")
    return 0 if not report.problems else 1


def command_albums(args: argparse.Namespace) -> int:
    library = _library(args)

    if args.json:
        console.print_json(
            data=[
                {"name": album.name, "title": album.title, "tracks": len(album.tracks)}
                for album in library.albums
            ]
        )
        return 0

    table = Table(box=None, pad_edge=False, header_style="bold")
    table.add_column("Album", style="bold magenta")
    table.add_column("Name", style="dim")
    table.add_column("Tracks", justify="right")
    table.add_column("Period", style="dim")

    for album in library.albums:
        table.add_row(album.title, album.name, str(len(album.tracks)), album.period)

    console.print(table)
    console.print(f"\n[dim]{len(library.albums)} albums, {len(library)} tracks[/dim]")
    return 0


def command_check(args: argparse.Namespace) -> int:
    """Report what the library is missing, so gaps in search are explainable."""
    library = _library(args)
    tracks = library.tracks

    missing_audio = [track for track in tracks if not track.exists]
    missing_lyrics = [track for track in tracks if not track.has_lyrics]
    missing_kompoz = [track for track in tracks if not track.kompoz_id]

    console.print(f"[bold]{len(tracks)}[/bold] tracks in {len(library.albums)} albums")
    console.print(f"  audio present   {len(tracks) - len(missing_audio)}/{len(tracks)}")
    console.print(f"  lyrics indexed  {len(tracks) - len(missing_lyrics)}/{len(tracks)}")
    console.print(f"  kompoz ids      {len(tracks) - len(missing_kompoz)}/{len(tracks)}")

    if missing_audio:
        console.print("\n[red]missing audio[/red]")
        for track in missing_audio:
            console.print(f"  {track.album_title} / {track.name} → {track.local_path}")

    if library.warnings:
        console.print("\n[yellow]warnings[/yellow]")
        for warning in library.warnings:
            console.print(f"  {warning}")

    return 1 if missing_audio else 0


def command_tui(args: argparse.Namespace) -> int:
    from .tui import run_tui

    config = load_config(data_dir=args.data_dir, music_dir=args.music_dir)
    return run_tui(config, initial_query=" ".join(args.query or []))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="song-finder",
        description="Find mazy_suite songs by title, collaboration name, author or lyrics.",
    )
    parser.add_argument("--version", action="version", version=f"song-finder {__version__}")
    parser.add_argument("--data-dir", type=Path, help="the suite's data/ folder")
    parser.add_argument("--music-dir", type=Path, help="local root of the audio files")
    parser.add_argument("-v", "--verbose", action="store_true", help="report load warnings")
    parser.set_defaults(handler=command_tui, query=[], json=False)

    subparsers = parser.add_subparsers(dest="command")

    def add_query(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("query", nargs="*", help="search terms, optionally field:scoped")
        subparser.add_argument("--json", action="store_true", help="machine readable output")

    tui = subparsers.add_parser("tui", help="open the interactive browser (default)")
    tui.add_argument("query", nargs="*", help="query to start from")
    tui.set_defaults(handler=command_tui)

    finder = subparsers.add_parser("search", aliases=["find"], help="list matching songs")
    add_query(finder)
    finder.add_argument("-n", "--limit", type=int, help="keep only the best N results")
    finder.add_argument("--score", action="store_true", help="show match scores")
    finder.set_defaults(handler=command_search)

    show = subparsers.add_parser("show", help="everything about the best match")
    add_query(show)
    show.set_defaults(handler=command_show)

    which = subparsers.add_parser("identify", help="which song is this audio file?")
    which.add_argument("file", help="path or file name of an audio file")
    which.add_argument("--json", action="store_true", help="machine readable output")
    which.set_defaults(handler=command_identify)

    copy = subparsers.add_parser("copy", help="copy matching songs to a folder")
    add_query(copy)
    copy.add_argument("-o", "--output", type=Path, required=True, help="destination folder")
    copy.add_argument(
        "--rename",
        choices=[naming.value for naming in Naming],
        default=Naming.TITLE.value,
        help="how to name the copies (default: after the song title)",
    )
    copy.add_argument("-n", "--limit", type=int, help="copy only the best N matches")
    copy.add_argument("--lyrics", action="store_true", help="copy the .srt alongside")
    copy.add_argument("--by-album", action="store_true", help="keep album sub-folders")
    copy.add_argument("--overwrite", action="store_true", help="replace existing files")
    copy.add_argument("--dry-run", action="store_true", help="show what would happen")
    copy.set_defaults(handler=command_copy)

    albums = subparsers.add_parser("albums", help="list the albums")
    albums.add_argument("--json", action="store_true", help="machine readable output")
    albums.set_defaults(handler=command_albums)

    check = subparsers.add_parser("check", help="report missing audio, lyrics and ids")
    check.set_defaults(handler=command_check)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        return args.handler(args)
    except (ConfigError, LibraryError) as error:
        errors.print(f"[red]error[/red] {error}")
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
