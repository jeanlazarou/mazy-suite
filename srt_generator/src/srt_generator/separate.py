import subprocess
import sys
from pathlib import Path

MODEL = "htdemucs"


def separate_vocals(audio_path, device, cache_dir=None):
    """Extract the vocal stem with demucs, caching next to the source audio.

    Returns the path to the vocals wav file.
    """
    audio_path = Path(audio_path)

    if cache_dir is None:
        cache_dir = audio_path.parent / "separated"
    cache_dir = Path(cache_dir)

    vocals = cache_dir / MODEL / audio_path.stem / "vocals.wav"

    if vocals.exists():
        print(f"Using cached vocal stem: {vocals}")
        return vocals

    print(f"Separating vocals with demucs ({MODEL}, device={device})...")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "demucs",
            "--two-stems",
            "vocals",
            "-n",
            MODEL,
            "-d",
            device,
            "-o",
            str(cache_dir),
            str(audio_path),
        ],
        check=True,
    )

    if not vocals.exists():
        raise RuntimeError(f"demucs finished but {vocals} was not created")

    return vocals
