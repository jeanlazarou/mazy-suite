import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { parseMixDoc } from '../model/mixdoc';
import { clearHistory } from '../state/history';
import { addTrack, TRACK_COLORS } from './add_track';
import { applyMixDoc } from './apply_mix_doc';
import { loadMarkers, clearMarkers } from './load_markers';

// Ctrl+O: open stems (audio files) and/or a mix.json in one picker, like
// player_editor's open-files flow. Audio files replace the current tracks;
// a mix.json alone re-applies a saved mix onto the loaded tracks.
export const openFiles = async (fileList) => {
  const files = [...fileList];
  const jsonFile = files.find((f) => /\.json$/i.test(f.name));
  const audioFiles = files.filter((f) => f !== jsonFile);
  if (!jsonFile && !audioFiles.length) return;

  const doc = jsonFile ? parseMixDoc(JSON.parse(await jsonFile.text())) : null;

  if (audioFiles.length) {
    const buffers = await Promise.all(audioFiles.map(async (f) => ({
      file: f,
      buffer: await engine.decode(await f.arrayBuffer()),
    })));
    engine.stop();
    engine.clearBuffers();
    useMixStore.setState({
      tracks: [],
      groups: [],
      durations: {},
      selection: null,
      collapsedGroups: {},
      song: null, // picked ad hoc: no suite save destination
    });
    clearMarkers();
    buffers.forEach(({ file, buffer }, i) => addTrack({
      name: file.name.replace(/\.\w+$/, ''),
      color: TRACK_COLORS[i % TRACK_COLORS.length],
      buffer,
      fileName: file.name,
    }));
  }

  if (doc) {
    applyMixDoc(doc);
    if (doc.song) useMixStore.setState({ song: doc.song });
    if (doc.markersSource) await loadMarkers(doc.markersSource); // best effort via suite bridge
  }
  clearHistory();
  useMixStore.setState({ selection: null });
  engine.modelChanged();
};
