import { useMixStore } from '../state/store';
import { fetchDataFile, songDir } from '../api';
import { parseSrtMarkers } from '../model/srt';

// Resolve an SRT source into ruler markers. `source` is either a path
// relative to the data tree ("lyrics/X.srt", "stems/a/s/X.srt") or, as
// persisted in mix.json, a bare file name resolved against the song's
// folder and then data/lyrics/.
export const loadMarkers = async (source) => {
  const { song } = useMixStore.getState();
  const candidates = source.includes('/')
    ? [source]
    : [...(song ? [`${songDir(song)}/${source}`] : []), `lyrics/${source}`];
  for (const rel of candidates) {
    const r = await fetchDataFile(rel);
    if (!r) continue;
    const markers = parseSrtMarkers(await r.text());
    if (markers.length) {
      useMixStore.setState({ markers, markersSource: rel.split('/').pop() });
      return true;
    }
  }
  return false;
};

export const clearMarkers = () => {
  useMixStore.setState({ markers: [], markersSource: null });
};
