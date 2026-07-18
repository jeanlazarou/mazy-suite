import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { fetchDataFile } from '../api';
import { parseMixDoc } from '../model/mixdoc';
import { clearHistory } from '../state/history';
import { addTrack, TRACK_COLORS } from './add_track';
import { applyMixDoc } from './apply_mix_doc';
import { loadMarkers, clearMarkers } from './load_markers';
import { showToast } from './show_toast';

// Open a song from the suite's data tree (data/stems/<album>/<song>/):
// decode all stems, apply mix.json if present, load SRT markers if found.
export const openSuiteSong = async ({ album, song, stems, hasMix, srt }) => {
  const dir = `stems/${album}/${song}`;
  const files = await Promise.all(stems.map(async (name) => {
    const r = await fetchDataFile(`${dir}/${name}`);
    if (!r) throw new Error(`Missing stem: ${name}`);
    return { name, buffer: await engine.decode(await r.arrayBuffer()) };
  }));

  engine.stop();
  engine.clearBuffers();
  useMixStore.setState({
    tracks: [],
    groups: [],
    durations: {},
    selection: null,
    collapsedGroups: {},
    song: { album, title: song },
  });
  clearMarkers();
  files.forEach(({ name, buffer }, i) => addTrack({
    name: name.replace(/\.\w+$/, ''),
    color: TRACK_COLORS[i % TRACK_COLORS.length],
    buffer,
    fileName: name,
  }));

  let doc = null;
  if (hasMix) {
    const r = await fetchDataFile(`${dir}/mix.json`);
    if (r) {
      try {
        doc = parseMixDoc(await r.json());
        applyMixDoc(doc);
      } catch (e) {
        showToast(`mix.json ignored: ${e.message}`);
      }
    }
  }

  const markerSource = doc?.markersSource ?? srt;
  if (markerSource) await loadMarkers(markerSource);

  clearHistory();
  useMixStore.setState({ selection: null });
  engine.modelChanged();
  showToast(`Opened ${album} / ${song}${doc ? ' (mix.json applied)' : ''}`);
};
