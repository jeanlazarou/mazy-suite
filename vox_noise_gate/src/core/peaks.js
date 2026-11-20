// What the waveform draws. WaveSurfer mirrors |value| around the centre line,
// so one value per block is enough.

export const PEAKS_PER_SECOND = 2000;
export const LEVEL_VIEW_FLOOR = -90; // bottom of the level view, in dBFS

// Loudest sample of each block, all channels together
export function wavePeaks(channels, sampleRate, perSecond = PEAKS_PER_SECOND) {
  const length = channels[0].length;
  const block = Math.max(1, Math.round(sampleRate / perSecond));
  const peaks = new Float32Array(Math.ceil(length / block));

  for (const data of channels) {
    for (let p = 0, i = 0; i < length; p++) {
      const end = Math.min(length, i + block);
      let max = peaks[p];

      for (; i < end; i++) {
        const v = Math.abs(data[i]);

        if (v > max) max = v;
      }

      peaks[p] = max;
    }
  }

  return peaks;
}

// dB level mapped linearly onto the height: the noise floor becomes visible
export const levelToHeight = (db, floor = LEVEL_VIEW_FLOOR) =>
  Math.max(0, Math.min(1, (db - floor) / -floor));

export function levelPeaks(levels, floor = LEVEL_VIEW_FLOOR) {
  return levels.map((db) => levelToHeight(db, floor));
}
