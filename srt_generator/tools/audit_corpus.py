#
# Check the corrected SRTs a corpus is measured against.
#
# Every figure produced by compare_srt.py assumes the corrected file is
# right. That assumption broke once: a corrected file in this corpus had
# gained an extra region whose text was the string "undefined", and because
# the lyrics for the evaluation were recovered from the corrected SRTs, the
# bad line came back as an input and the aligner was asked to place a word
# that was never sung. It survived for weeks.
#
# Comparing entry counts does not catch that on its own — a line present in
# both files agrees with itself. What catches it is the audio: a corrected
# region sitting on digital silence is a line the singer never sang there.
#
# Usage:
#   uv run python tools/audit_corpus.py <folder>
#   uv run python tools/audit_corpus.py <folder> --no-audio   (counts only)
#

import argparse
import sys
from pathlib import Path

from compare_srt import parse_srt

# the checks live in the package so this tool and the generator agree
from srt_generator.diagnose import audit_corrected


def songs(directory, fixed_suffix):
    """Every corrected file in the folder, with its lyrics and audio."""
    found = []

    for fixed in sorted(directory.glob(f"*{fixed_suffix}")):
        name = fixed.name[: -len(fixed_suffix)]
        found.append(
            (name, fixed, fixed.with_name(f"{name}.txt"),
             fixed.with_name(f"{name}.wav"))
        )

    return found


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="audit_corpus",
        description=(
            "Check the corrected SRTs in a folder against their lyrics and "
            "their audio, before trusting anything measured against them."
        ),
    )
    parser.add_argument(
        "folder", type=Path, help="folder holding the corrected SRTs"
    )
    parser.add_argument(
        "--fixed-suffix",
        default=" - fixed.srt",
        help="how corrected files are named (default: '%(default)s')",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help=(
            "skip the audio check, which has to decode every stem; leaves "
            "only the entry-count comparison"
        ),
    )

    args = parser.parse_args(argv)
    found = songs(args.folder, args.fixed_suffix)

    if not found:
        sys.exit(f"No '{args.fixed_suffix}' files found in {args.folder}")

    if not args.no_audio:
        from srt_generator.align import load_audio
        from srt_generator.trim import FRAME, silent_frames

    from srt_generator.align import load_lyrics

    problems = checked = 0

    for name, fixed, lyrics_path, audio_path in found:
        if not lyrics_path.exists():
            print(f"? {name}: no lyrics file beside it", file=sys.stderr)
            continue

        segments = parse_srt(fixed)
        lines = load_lyrics(lyrics_path)
        silent = frame = None

        if not args.no_audio:
            if not audio_path.exists():
                print(f"? {name}: no audio beside it", file=sys.stderr)
            else:
                silent = silent_frames(load_audio(str(audio_path)))
                frame = FRAME

        checked += 1
        notes = audit_corrected(
            segments, lines, silent=silent, frame=frame or 0.02
        )

        for note in notes:
            problems += 1
            print(f"{name}: {note}")

    print(f"\n{checked} corrected file{'s' if checked != 1 else ''} checked, "
          f"{problems} problem{'s' if problems != 1 else ''}")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
