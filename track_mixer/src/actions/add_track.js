import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { uid } from './ids';

export const TRACK_COLORS = ['#6fd66f', '#5aa2e0', '#c98bd6', '#e0b05a', '#5ad6c8', '#e08a5a', '#9a8ae0', '#d6cf5a'];

export const addTrack = ({ name, color, buffer, fileName = null }) => {
  const id = uid('track');
  engine.setBuffer(id, buffer);
  useMixStore.setState((s) => ({
    tracks: [...s.tracks, {
      id, name, color, fileName,
      env: [], regions: [], pan: [], solo: false, mute: false,
      eq: { low: 0, mid: 0, high: 0 }, group: null,
    }],
    durations: { ...s.durations, [id]: buffer.duration },
  }));
  return id;
};
