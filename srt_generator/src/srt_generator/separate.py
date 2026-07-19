import os
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

    env = os.environ.copy()
    if device == "mps":
        # htdemucs has a conv layer too wide for the MPS backend; torch
        # runs just that op on CPU when this fallback is enabled
        env["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

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
        env=env,
    )

    if not vocals.exists():
        raise RuntimeError(f"demucs finished but {vocals} was not created")

    return vocals
