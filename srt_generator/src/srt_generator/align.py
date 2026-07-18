def load_lyrics(path):
    """Read a lyrics text file: one line per SRT entry, in singing order.

    The file must be fully expanded (choruses written out at every
    repetition); blank lines are ignored.
    """
    lines = [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    if not lines:
        raise ValueError(f"No lyrics lines found in {path}")

    return lines


def align_lyrics(audio_path, lyrics_lines, model_name, device, language):
    """Force-align known lyrics lines onto the audio.

    Returns (start, end, text) tuples, one per lyrics line.
    """
    import stable_whisper

    print(f"Loading whisper model {model_name} (device={device})...")
    model = stable_whisper.load_model(model_name, device=device)

    print(f"Aligning {len(lyrics_lines)} lyrics lines...")
    result = model.align(
        str(audio_path),
        "\n".join(lyrics_lines),
        language=language,
        original_split=True,
    )

    return [
        (segment.start, segment.end, segment.text)
        for segment in result.segments
    ]


def transcribe(audio_path, model_name, device, language):
    """Fallback when no lyrics file is given: free transcription.

    Word accuracy on songs is rough; the point is a structurally valid
    draft with usable timings.
    """
    import stable_whisper

    print(f"Loading whisper model {model_name} (device={device})...")
    model = stable_whisper.load_model(model_name, device=device)

    print("Transcribing (no lyrics file given, expect rough words)...")
    result = model.transcribe(str(audio_path), language=language, vad=True)

    return [
        (segment.start, segment.end, segment.text)
        for segment in result.segments
    ]
