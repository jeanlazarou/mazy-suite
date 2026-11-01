#
# Measure a draft against the file a human saved from player_editor.
#
# The generator's real objective is editing cost, not timing accuracy in the
# abstract, and the only honest measurement of it is the difference between
# what the tool produced and what the user kept. This turns one such pair
# into numbers: how far each region had to move, and whether the draft shows
# the signature of a collapsed alignment.
#
# Usage:
#   uv run python tools/compare_srt.py draft.srt fixed.srt [--table]
#

import argparse
import statistics
import sys
from pathlib import Path

# detection lives in the package so the tool and the generator cannot drift
from srt_generator.diagnose import at_minimum_duration, collapsed_runs

# postprocess defaults; a run of regions sitting exactly on these two values
# is the invariant pass legalising degenerate aligner output, not content
MIN_DURATION = 0.2
MIN_GAP = 0.02
TOLERANCE = 0.005

BUCKETS = [
    ("already right (<= 0.25 s)", 0.0, 0.25),
    ("a nudge (0.25 - 1 s)", 0.25, 1.0),
    ("a real drag (1 - 5 s)", 1.0, 5.0),
    ("re-placed (> 5 s)", 5.0, float("inf")),
]


def parse_srt(path):
    """Read an SRT into (start, end, text) tuples."""
    blocks = path.read_text(encoding="utf-8").strip().split("\n\n")
    segments = []

    for block in blocks:
        lines = block.split("\n")
        start, end = lines[1].split("-->")
        segments.append(
            (parse_timestamp(start), parse_timestamp(end), " ".join(lines[2:]))
        )

    return segments


def parse_timestamp(text):
    hours, minutes, seconds = text.strip().split(":")

    return (
        int(hours) * 3600 + int(minutes) * 60 + float(seconds.replace(",", "."))
    )


def bucket_counts(moves):
    """How many regions fall in each editing-effort band."""
    return [
        sum(1 for m in moves if (m <= high if low == 0 else low < m <= high))
        for _, low, high in BUCKETS
    ]


def compare(draft, fixed):
    moves = [abs(b[0] - a[0]) for a, b in zip(draft, fixed)]

    return {
        "count": len(draft),
        "text_preserved": [s[2] for s in draft] == [s[2] for s in fixed],
        "moves": moves,
        "median": statistics.median(moves),
        "max": max(moves),
        "untouched": sum(1 for m in moves if m <= 0.25),
        "runs": collapsed_runs(draft),
    }


def report(result, draft, fixed, show_table):
    print(f"entries              {result['count']}")
    print(f"text preserved       {'yes' if result['text_preserved'] else 'NO'}")
    print(f"median move          {result['median']:.2f} s")
    print(f"largest move         {result['max']:.2f} s")

    print("\nhow far each region had to move")
    for (label, _, _), n in zip(BUCKETS, bucket_counts(result["moves"])):
        print(f"  {label:<28} {n:>3} / {result['count']}")

    if result["runs"]:
        print("\ncollapsed runs in the draft (aligner lost sync here)")
        for run in result["runs"]:
            first, last = run[0], run[-1]
            span = draft[last][1] - draft[first][0]
            real = fixed[last][1] - fixed[first][0]
            minimal = at_minimum_duration(draft, run, MIN_DURATION)
            print(
                f"  entries {first + 1}-{last + 1}: {len(run)} regions packed "
                f"into {span:.1f} s of audio that should span {real:.1f} s "
                f"({minimal} of them at min_duration)"
            )
    else:
        print("\nno collapsed runs detected")

    if show_table:
        print(f"\n{'#':>3} {'draft':>16} {'fixed':>16} {'move':>8}  text")
        for i, (a, b) in enumerate(zip(draft, fixed), 1):
            print(
                f"{i:>3} {a[0]:>7.2f}-{a[1]:<8.2f} {b[0]:>7.2f}-{b[1]:<8.2f} "
                f"{b[0] - a[0]:>+8.2f}  {a[2][:40]}"
            )


def find_pairs(directory, draft_suffix, fixed_suffix):
    """Pair '<name><draft_suffix>' with '<name><fixed_suffix>' in a folder."""
    pairs = []

    for draft in sorted(directory.glob(f"*{draft_suffix}")):
        name = draft.name[: -len(draft_suffix)]
        fixed = directory / f"{name}{fixed_suffix}"

        if fixed.exists():
            pairs.append((name, draft, fixed))

    return pairs


def corpus_report(rows):
    """One line per song, then the totals that the write-up can quote."""
    print(
        f"{'song':<34} {'lines':>5} {'median':>7} {'max':>8} "
        f"{'right':>6} {'nudge':>6} {'drag':>5} {'redo':>5} {'runs':>5}"
    )
    print("-" * 92)

    totals = [0, 0, 0, 0]
    lines = collapsed = songs_with_runs = 0

    for name, result in rows:
        counts = bucket_counts(result["moves"])
        totals = [t + c for t, c in zip(totals, counts)]
        lines += result["count"]
        collapsed += len(result["runs"])
        songs_with_runs += 1 if result["runs"] else 0

        print(
            f"{name[:34]:<34} {result['count']:>5} "
            f"{result['median']:>6.2f}s {result['max']:>7.2f}s "
            f"{counts[0]:>6} {counts[1]:>6} {counts[2]:>5} {counts[3]:>5} "
            f"{len(result['runs']):>5}"
        )

    print("-" * 92)
    print(f"{len(rows)} song{'s' if len(rows) != 1 else ''}, {lines} regions")

    for (label, _, _), n in zip(BUCKETS, totals):
        print(f"  {label:<28} {n:>4} / {lines}  ({100 * n / lines:.0f}%)")

    print(
        f"\ncollapsed runs: {collapsed} across "
        f"{songs_with_runs} of {len(rows)} songs"
    )


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compare_srt",
        description=(
            "Measure generated drafts against the SRTs a human saved from "
            "player_editor: how far every region had to move, and whether "
            "the draft shows a collapsed alignment."
        ),
    )
    parser.add_argument("draft", type=Path, nargs="?", help="the generated SRT")
    parser.add_argument("fixed", type=Path, nargs="?", help="the corrected SRT")
    parser.add_argument(
        "--table", action="store_true", help="print the per-entry comparison"
    )
    parser.add_argument(
        "--corpus",
        type=Path,
        metavar="DIR",
        help="measure every draft/corrected pair in a folder at once",
    )
    parser.add_argument(
        "--draft-suffix",
        default=" - generated.srt",
        help="how draft files are named (default: '%(default)s')",
    )
    parser.add_argument(
        "--fixed-suffix",
        default=" - fixed.srt",
        help="how corrected files are named (default: '%(default)s')",
    )

    args = parser.parse_args(argv)

    if args.corpus:
        pairs = find_pairs(args.corpus, args.draft_suffix, args.fixed_suffix)

        if not pairs:
            sys.exit(
                f"No '{args.draft_suffix}' / '{args.fixed_suffix}' pairs "
                f"found in {args.corpus}"
            )

        rows = []
        for name, draft_path, fixed_path in pairs:
            draft, fixed = parse_srt(draft_path), parse_srt(fixed_path)

            if len(draft) != len(fixed):
                print(
                    f"skipping {name}: {len(draft)} draft entries vs "
                    f"{len(fixed)} corrected",
                    file=sys.stderr,
                )
                continue

            rows.append((name, compare(draft, fixed)))

        if not rows:
            sys.exit("No comparable pairs")

        corpus_report(rows)
        return

    if not args.draft or not args.fixed:
        parser.error("give two SRT files, or --corpus DIR")

    draft = parse_srt(args.draft)
    fixed = parse_srt(args.fixed)

    if len(draft) != len(fixed):
        sys.exit(
            f"Entry counts differ ({len(draft)} vs {len(fixed)}); the two "
            f"files are not the same song, or lines were added by hand."
        )

    report(compare(draft, fixed), draft, fixed, args.table)


if __name__ == "__main__":
    main()
