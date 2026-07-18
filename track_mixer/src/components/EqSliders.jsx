import { useCallback, useRef } from 'react';
import { useMixStore } from '../state/store';
import { recordHistory } from '../state/history';
import { setEq } from '../actions/set_eq';
import { resetEqBand } from '../actions/reset_eq_band';

const BANDS = [
  { band: 'low', label: 'L', hint: 'low shelf 200 Hz' },
  { band: 'mid', label: 'M', hint: 'peaking 1 kHz' },
  { band: 'high', label: 'H', hint: 'high shelf 4 kHz' },
];

// The one place a fader-like control is the simplest thing (per spec).
export default function EqSliders({ trackId }) {
  const eq = useMixStore(useCallback((s) => s.tracks.find((t) => t.id === trackId)?.eq, [trackId]));
  const recordedRef = useRef(false);
  if (!eq) return null;

  return (
    <div className="eq">
      {BANDS.map(({ band, label, hint }) => (
        <label key={band} className="eq-band" title={`EQ ${hint}: ${eq[band]} dB — double-click resets`}>
          <input
            className="eq-slider"
            type="range"
            min="-12"
            max="12"
            step="0.5"
            value={eq[band]}
            onPointerDown={() => { recordedRef.current = false; }}
            onChange={(e) => {
              if (!recordedRef.current) {
                recordHistory(); // once per slider gesture, before the first change
                recordedRef.current = true;
              }
              setEq(trackId, band, Number(e.target.value));
            }}
            onPointerUp={(e) => e.target.blur()}
            onDoubleClick={() => resetEqBand(trackId, band)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
