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
            "compute device; auto uses mps for demucs and cpu for whisper, "
            "which is the safe default on Apple Silicon"
        ),
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=0.2,
        help="minimum segment duration in seconds (default: 0.2)",
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )

    return parser


def pick_devices(arg):
    """Return (demucs_device, whisper_device)."""
    if arg != "auto":
        return arg, arg

    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps", "cpu"
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

    from .align import align_lyrics, load_lyrics, transcribe

    if args.lyrics is not None:
        lines = load_lyrics(args.lyrics)
        segments = align_lyrics(
            audio, lines, args.model, whisper_device, args.language
        )
    else:
        segments = transcribe(audio, args.model, whisper_device, args.language)

    segments = postprocess(segments, min_duration=args.min_duration)

    if not segments:
        sys.exit("No segments produced; nothing to write")

    write_srt(segments, output)
    print(f"Wrote {len(segments)} entries to {output}")


if __name__ == "__main__":
    main()
