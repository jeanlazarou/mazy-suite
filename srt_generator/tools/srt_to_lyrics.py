#
# Recover a lyrics input file from a corrected SRT.
#
# The inverse of what the generator writes. Useful for building an
# evaluation corpus out of files a user has already finished by hand: the
# corrected SRT is ground truth for both the words and their timings, so the
# lyrics extracted from it are exactly the input that should have produced
# it. Regenerating a draft from these and comparing against the same SRT
# (tools/compare_srt.py) measures the current tool against a real result.
#
# Usage:
#   uv run python tools/srt_to_lyrics.py song.srt
#   uv run python tools/srt_to_lyrics.py *.srt --out-dir lyrics --strip-suffix " - fixed"
#

import argparse
import sys
from pathlib import Path


def extract_lines(path):
    """The text of every cue, in order, one entry per line.

    A cue whose text wrapped onto several lines is rejoined with a space,
    matching how player_editor's parser reads it back.
    """
    blocks = path.read_text(encoding="utf-8").strip().split("\n\n")
    lines = []

    for block in blocks:
        rows = block.split("\n")

        if len(rows) < 3:
            raise ValueError(f"{path.name}: malformed block {rows[0]!r}")

        lines.append(" ".join(row.strip() for row in rows[2:]).strip())

    return lines


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="srt_to_lyrics",
        description=(
            "Write the lyrics text file that corresponds to an SRT: one "
            "line per cue, in singing order, ready to feed back to "
            "srt_generator as the source of truth."
        ),
    )
    parser.add_argument("srt", type=Path, nargs="+", help="SRT file(s)")
    parser.add_argument(
        "-o",
        "--out-dir",
        type=Path,
        help="where to write the .txt files (default: beside each SRT)",
    )
    parser.add_argument(
        "--strip-suffix",
        default="",
        metavar="TEXT",
        help="drop this from the end of the name, e.g. ' - fixed'",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite an existing .txt instead of skipping it",
    )

    args = parser.parse_args(argv)

    for path in args.srt:
        stem = path.stem

        if args.strip_suffix and stem.endswith(args.strip_suffix):
            stem = stem[: -len(args.strip_suffix)]

        out_dir = args.out_dir or path.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / f"{stem}.txt"

        if target.exists() and not args.force:
            print(f"skip   {target}  (exists; --force to overwrite)")
            continue

        try:
            lines = extract_lines(path)
        except ValueError as error:
            print(f"ERROR  {error}", file=sys.stderr)
            continue

        target.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote  {target}  ({len(lines)} lines)")


if __name__ == "__main__":
    main()
