import { useCallback, useRef } from 'react';
import { useMixStore } from '../state/store';
import { toggleSolo } from '../actions/toggle_solo';
import { toggleMute } from '../actions/toggle_mute';
import { loadTrackFile } from '../actions/load_track_file';
import { hoverTrack } from '../actions/hover_track';
import { cycleTrackGroup } from '../actions/cycle_track_group';
import { removeTrack } from '../actions/remove_track';
import Lane from './Lane';
import EqSliders from './EqSliders';

export default function TrackRow({ laneId }) {
  const track = useMixStore(useCallback((s) => s.tracks.find((t) => t.id === laneId), [laneId]));
  const group = useMixStore(useCallback((s) => s.groups.find((g) => g.id === track?.group), [track?.group]));
  const hasGroups = useMixStore((s) => s.groups.length > 0);
  const fileRef = useRef(null);
  if (!track) return null;

  return (
    <div
      className="row"
      onPointerEnter={() => hoverTrack(laneId)}
      onPointerLeave={() => hoverTrack(null)}
    >
      <div className="head">
        <div className="top">
          <div className="name" style={{ color: track.color }}>{track.name}</div>
          <span className="top-btns">
            {hasGroups && (
              <button
                className="group-dot"
                style={group ? { background: group.color, borderColor: group.color } : undefined}
                title={group ? `Group: ${group.name} — click to cycle` : 'No group — click to cycle'}
                onClick={() => cycleTrackGroup(laneId)}
              />
            )}
            <button
              className="ghost"
              title="Remove track (undoable)"
              onClick={() => removeTrack(laneId)}
            >×</button>
          </span>
        </div>
        <div className="btns">
          <button
            className={track.solo ? 'solo on' : 'solo'}
            title="Solo (S)"
            onClick={() => toggleSolo(laneId)}
          >S</button>
          <button
            className={track.mute ? 'mute on' : 'mute'}
            title="Mute (M)"
            onClick={() => toggleMute(laneId)}
          >M</button>
          <button onClick={() => fileRef.current.click()}>Load…</button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={(e) => {
              if (e.target.files[0]) loadTrackFile(laneId, e.target.files[0]);
            }}
          />
        </div>
        <EqSliders trackId={laneId} />
      </div>
      <div className="lane">
        <Lane laneId={laneId} kind="track" />
      </div>
    </div>
  );
}
