import argparse
import sys
from pathlib import Path

from . import __version__
from .srt_writer import postprocess, write_srt


def build_parser():
    parser = argparse.ArgumentParser(
        prog="srt_generator",
        description=(
            "Generate a draft SRT file with lyric timings from a song, "
            "to be finished in player_editor. Preferred mode: provide the "
            "lyrics as a text file (one line per SRT entry, fully expanded "
            "in singing order) so timings come from forced alignment."
        ),
    )

    parser.add_argument("audio", type=Path, help="audio file (mp3, wav, flac, ...)")
    parser.add_argument(
        "lyrics",
        type=Path,
        nargs="?",
        help="lyrics text file; omit to fall back to free transcription",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="output SRT path (default: audio file name with .srt extension)",
    )
    parser.add_argument(
        "--mix",
        action="store_true",
        help="audio is a full mix: run demucs first to isolate the vocals",
    )
    parser.add_argument(
        "--model",
        default="large-v3",
        help="whisper model to use (default: large-v3)",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="lyrics language code (default: en)",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cpu", "mps", "cuda"],
        help=(
            "compute device; auto means cpu on Apple Silicon (htdemucs "
            "exceeds MPS conv limits and whisper is unreliable there)"
        ),
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=0.2,
        help="minimum segment duration in seconds (default: 0.2)",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=5.0,
        metavar="SECONDS",
        help=(
            "longest a region may last in seconds (default: 5, about a "
            "sung line); an aligner that stretches a line to the next one "
            "is cut back to the last singing within the cap, or to the cap "
            "itself when nothing else bounds it. 0 disables the cap"
        ),
    )
    parser.add_argument(
        "--no-trim",
        action="store_true",
        help="keep raw aligner edges instead of snapping them to silence",
    )
    parser.add_argument(
        "--trim-db",
        type=float,
        default=-40.0,
        help=(
            "silence threshold in dB relative to the loudest point "
            "(default: -40); raise towards -30 if regions still trail "
            "into noise, lower towards -50 if quiet endings get cut"
        ),
    )
    parser.add_argument(
        "--max-gap",
        type=float,
        default=None,
        metavar="SECONDS",
        help=(
            "experimental: close a region at its first internal silence "
            "longer than this many seconds (e.g. 1.0); off by default "
            "because a wrong cut drops real singing from the region, "
            "which is harder to fix in player_editor than a too-long one"
        ),
    )
    parser.add_argument(
        "--anchor",
        action="store_true",
        help=(
            "experimental: also transcribe the audio freely and use the "
            "lines it recognises as control points to correct the "
            "alignment. Roughly doubles the run. Helps when the aligner "
            "loses sync across a long instrumental passage; it cannot "
            "help when the transcript recognises nothing"
        ),
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help=(
            "also write a self-contained HTML timeline next to the SRT, "
            "showing the voiced audio and what every stage produced on one "
            "time axis — for seeing where an alignment went wrong"
        ),
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )

    return parser


def pick_devices(arg):
    """Return (demucs_device, whisper_device).

    auto resolves to cpu on Apple Silicon: htdemucs has a conv layer that
    exceeds the MPS backend's 65536 output-channel limit, and the
    PYTORCH_ENABLE_MPS_FALLBACK escape hatch does not intercept that
    (it only covers unimplemented ops, not size limits). cuda is picked
    up automatically when available.
    """
    if arg != "auto":
        return arg, arg

    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "cuda"
    except ImportError:
        pass

    return "cpu", "cpu"


def main(argv=None):
    args = build_parser().parse_args(argv)

    if not args.audio.exists():
        sys.exit(f"Audio file not found: {args.audio}")
    if args.lyrics is not None and not args.lyrics.exists():
        sys.exit(f"Lyrics file not found: {args.lyrics}")

    max_duration = args.max_duration if args.max_duration > 0 else None

    if max_duration is not None and max_duration < args.min_duration:
        sys.exit(
            f"--max-duration ({max_duration}) is below --min-duration "
            f"({args.min_duration})"
        )

    output = args.output or args.audio.with_suffix(".srt")
    demucs_device, whisper_device = pick_devices(args.device)

    audio = args.audio
    if args.mix:
        from .separate import separate_vocals

        audio = separate_vocals(audio, demucs_device)

    from .align import (
        LyricsCountMismatch,
        align_lyrics,
        load_audio,
        load_lyrics,
        transcribe,
    )

    audio_data = load_audio(audio)

    stages = []
    failed = set()
    heard_segments = None
    matched = []

    if args.lyrics is not None:
        lines = load_lyrics(args.lyrics)
        try:
            segments = align_lyrics(
                audio_data, lines, args.model, whisper_device, args.language
            )
        except LyricsCountMismatch as error:
            sys.exit(str(error))

        from .align import failed_indexes

        failed = failed_indexes(segments)
        stages.append(("aligned", list(segments)))

        if args.anchor:
            from .anchor import anchor_segments, better_draft
            from .trim import voiced_frames

            print("Transcribing again to cross-check the alignment...")
            heard = transcribe(
                audio_data, args.model, whisper_device, args.language
            )
            from .anchor import control_points

            rewarped, used = anchor_segments(segments, lines, heard)
            matched = control_points(segments, lines, heard)

            # anchoring helps some songs and harms others, so keep the
            # draft that leaves fewer regions sitting in silence
            segments, kept = better_draft(
                segments, rewarped, voiced_frames(audio_data, args.trim_db)
            )

            heard_segments = heard
            if kept == "anchored":
                stages.append(("anchored", list(segments)))

            print(
                f"Matched {used}/{len(lines)} lines to the transcript; "
                f"kept the {kept} timings"
            )
    else:
        segments = transcribe(
            audio_data, args.model, whisper_device, args.language
        )

    if not args.no_trim:
        from .trim import trim_segments

        segments = trim_segments(
            audio_data,
            segments,
            threshold_db=args.trim_db,
            min_duration=args.min_duration,
            max_gap=args.max_gap,
            max_duration=max_duration,
        )

        stages.append(("trimmed", list(segments)))

    segments = postprocess(
        segments,
        min_duration=args.min_duration,
        max_duration=max_duration,
    )

    if not segments:
        sys.exit("No segments produced; nothing to write")

    stages.append(("final", list(segments)))

    write_srt(segments, output)
    print(f"Wrote {len(segments)} entries to {output}")

    notes = report_warnings(segments, audio_data, args)

    if args.debug:
        if heard_segments is None and args.lyrics is not None:
            # the transcript is independent evidence of where the singing
            # is; worth the extra pass when the point is to investigate
            print("Transcribing for the debug timeline...")
            heard_segments = transcribe(
                audio_data, args.model, whisper_device, args.language
            )

        write_debug(
            output, audio_data, args, stages, notes, heard_segments, failed,
            matched, lines if args.lyrics is not None else None,
        )


def report_warnings(segments, audio_data, args):
    """Point at the parts of the draft that look wrong.

    The aligner cannot flag its own failures — it returns a complete,
    legal, confidently-wrong answer — but the damage leaves fingerprints
    in the finished file. Saying where to look is the difference between
    a five-minute edit and hunting through a whole song.
    """
    from .diagnose import warnings
    from .trim import FRAME, silent_frames, voiced_frames

    notes = warnings(
        segments,
        voiced_frames(audio_data, args.trim_db),
        frame=FRAME,
        min_duration=args.min_duration,
        silent=silent_frames(audio_data),
    )

    if notes:
        print("\nThis draft has signs of a lost alignment:")
        for note in notes:
            print(f"  - {note}")
        print(
            "  Re-running with --anchor repairs some of these; see "
            "docs/how-it-works.md"
        )

    return notes


def write_debug(output, audio_data, args, stages, notes, heard, failed,
                matched=(), lines=None):
    """Write the HTML timeline, and the transcript, beside the SRT."""
    from whisper.audio import SAMPLE_RATE

    from . import debug_view
    from .anchor import match_lines
    from .trim import FRAME, voiced_frames

    path = output.with_suffix(".debug.html")
    pairs = ()

    if heard:
        transcript = output.with_suffix(".transcript.txt")
        transcript.write_text(
            "".join(
                f"{start:8.2f}  {end:8.2f}  {text.strip()}\n"
                for start, end, text in heard
            ),
            encoding="utf-8",
        )
        print(f"Wrote what the model heard to {transcript}")

        if lines:
            pairs = match_lines(lines, [text for _, _, text in heard])

    debug_view.write(
        path,
        output.stem,
        len(audio_data) / SAMPLE_RATE,
        voiced_frames(audio_data, args.trim_db),
        FRAME,
        stages,
        notes,
        heard,
        failed,
        matched,
        lines,
        pairs,
    )

    print(f"Wrote the stage timeline to {path}")


if __name__ == "__main__":
    main()
