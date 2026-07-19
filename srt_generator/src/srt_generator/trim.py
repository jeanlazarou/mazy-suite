#
# Snap segment edges to the actually-voiced part of the audio.
#
# Aligners stretch a line's end up to where the next line starts, even
# across an obvious silence, so regions don't "close" when the singing
# stops. Vocal audio is essentially silent between lines, so a simple
# RMS-energy gate is enough to pull the edges back in.
#

FRAME = 0.02  # seconds per analysis frame


def trim_segments(audio, segments, threshold_db=-40.0, pad=0.12,
                  min_duration=0.2, max_gap=None):
    """Shrink (start, end, text) tuples to their voiced span.

    threshold_db is relative to the loudest frame of the track. Edges are
    never grown, and a segment is left untouched when trimming would make
    it shorter than min_duration or when no voiced frame is found in it.

    With max_gap set, a segment is also closed at its first internal
    silence longer than that many seconds. Off by default: when the
    aligner slips (typically on repeated lines) this guesses which side
    of the silence the line belongs to, and a wrong guess drops real
    singing from the region — harder to repair in player_editor than an
    over-long region, which is a quick edge drag.
    """
    voiced = _voiced_frames(audio, threshold_db)

    if voiced is None:
        return segments

    return _trim_to_voiced(voiced, segments, pad, min_duration, max_gap)


def _voiced_frames(audio, threshold_db):
    """Return a boolean array, one entry per FRAME, True where there is
    signal above the threshold. audio is a decoded 16 kHz mono array
    (align.load_audio) or a path to decode."""
    import numpy as np
    from whisper.audio import SAMPLE_RATE, load_audio

    if not isinstance(audio, np.ndarray):
        audio = load_audio(str(audio))

    frame_len = int(FRAME * SAMPLE_RATE)
    count = len(audio) // frame_len

    if count == 0:
        return None

    frames = audio[: count * frame_len].reshape(count, frame_len)
    rms = np.sqrt(np.mean(frames**2, axis=1))

    peak = rms.max()
    if peak == 0:
        return None

    return rms > peak * 10 ** (threshold_db / 20)


def _trim_to_voiced(voiced, segments, pad, min_duration, max_gap=None):
    import numpy as np

    total = len(voiced)
    result = []

    for start, end, text in segments:
        first_frame = max(int(start / FRAME), 0)
        last_frame = min(int(end / FRAME) + 1, total)

        indexes = np.flatnonzero(voiced[first_frame:last_frame])

        if indexes.size:
            last_voiced = indexes[-1]

            if max_gap is not None:
                gaps = np.flatnonzero(np.diff(indexes) * FRAME > max_gap)
                if gaps.size:
                    last_voiced = indexes[gaps[0]]

            trimmed_start = max(start, (first_frame + indexes[0]) * FRAME - pad)
            trimmed_end = min(end, (first_frame + last_voiced + 1) * FRAME + pad)

            if trimmed_end - trimmed_start >= min_duration:
                start, end = trimmed_start, trimmed_end

        result.append((start, end, text))

    return result
