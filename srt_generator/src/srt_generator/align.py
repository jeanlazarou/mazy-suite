class LyricsCountMismatch(RuntimeError):
    """The aligner did not return exactly one segment per lyrics line."""


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


def load_audio(audio_path):
    """Decode the audio once, to 16 kHz mono, for alignment and trimming.

    Passing the decoded array to stable-ts (instead of a path) also avoids
    its streaming ffmpeg loader, which spills harmless but noisy
    broken-pipe errors when alignment finishes before the end of the file.
    """
    from whisper.audio import load_audio as whisper_load_audio

    return whisper_load_audio(str(audio_path))


def align_lyrics(audio, lyrics_lines, model_name, device, language):
    """Force-align known lyrics lines onto the audio.

    Returns (start, end, text) tuples, one per lyrics line.
    """
    import stable_whisper

    print(f"Loading whisper model {model_name} (device={device})...")
    model = stable_whisper.load_model(model_name, device=device)

    print(f"Aligning {len(lyrics_lines)} lyrics lines...")
    result = model.align(
        audio,
        "\n".join(lyrics_lines),
        language=language,
        original_split=True,
    )

    timings = [(segment.start, segment.end) for segment in result.segments]

    return pair_with_lyrics(timings, lyrics_lines)


def failed_indexes(segments):
    """Which lines the aligner could not place at all.

    stable-ts counts a segment as failed when it comes back with zero or
    negative duration, and warns with the count but not the identities.
    The same test applied to the raw segments recovers which lines they
    were — and those are exactly the ones the invariant pass has to
    legalise into minimum-length regions, so they are the seed of every
    collapsed run.
    """
    return {
        i for i, (start, end, _) in enumerate(segments) if end - start <= 0
    }


def pair_with_lyrics(timings, lyrics_lines):
    """Give every lyrics line its timing, in order.

    The lyrics file is the source of truth for *what* is sung; the aligner
    only decides *when*. So the text comes from the file rather than from
    the model's echo of it, and the two counts have to match exactly.

    A mismatch is refused instead of written out. player_editor binds
    lyrics to regions by position alone — line i to timings i*2 and
    i*2+1 — so one missing segment does not cost one bad region, it
    shifts every line after it onto the wrong region, and the SRT still
    looks perfectly well formed.
    """
    if len(timings) != len(lyrics_lines):
        raise LyricsCountMismatch(
            f"Aligner returned {len(timings)} segments for "
            f"{len(lyrics_lines)} lyrics lines. Refusing to write a draft "
            f"that drops or duplicates lines: player_editor binds lyrics to "
            f"regions by position, so every line after the mismatch would "
            f"sit on the wrong region."
        )

    return [
        (start, end, line)
        for (start, end), line in zip(timings, lyrics_lines)
    ]


def transcribe(audio, model_name, device, language):
    """Fallback when no lyrics file is given: free transcription.

    Word accuracy on songs is rough; the point is a structurally valid
    draft with usable timings.
    """
    import stable_whisper

    print(f"Loading whisper model {model_name} (device={device})...")
    model = stable_whisper.load_model(model_name, device=device)

    print("Transcribing (no lyrics file given, expect rough words)...")
    result = model.transcribe(audio, language=language, vad=True)

    return [
        (segment.start, segment.end, segment.text)
        for segment in result.segments
    ]
