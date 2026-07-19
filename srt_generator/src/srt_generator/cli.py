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

    output = args.output or args.audio.with_suffix(".srt")
    demucs_device, whisper_device = pick_devices(args.device)

    audio = args.audio
    if args.mix:
        from .separate import separate_vocals

        audio = separate_vocals(audio, demucs_device)

    from .align import align_lyrics, load_audio, load_lyrics, transcribe

    audio_data = load_audio(audio)

    if args.lyrics is not None:
        lines = load_lyrics(args.lyrics)
        segments = align_lyrics(
            audio_data, lines, args.model, whisper_device, args.language
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
        )

    segments = postprocess(segments, min_duration=args.min_duration)

    if not segments:
        sys.exit("No segments produced; nothing to write")

    write_srt(segments, output)
    print(f"Wrote {len(segments)} entries to {output}")


if __name__ == "__main__":
    main()
