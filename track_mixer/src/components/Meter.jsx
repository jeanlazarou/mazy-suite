import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { resetClip } from '../actions/reset_clip';

// Master level meter + latched clip indicator: drawn envelopes can silently
// sum into clipping, so this reads the signal after the master curve —
// exactly what the exported WAV will contain.
export default function Meter() {
  const barRef = useRef(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    let raf;
    const tick = () => {
      const level = engine.getMeterLevel();
      if (barRef.current) {
        barRef.current.style.width = `${Math.min(level, 1) * 100}%`;
      }
      setClipped((prev) => (prev === engine.clipped ? prev : engine.clipped));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="meter" title={clipped ? 'CLIPPED — click to reset' : 'Master level'}>
      <div className="meter-track"><div className="meter-bar" ref={barRef} /></div>
      <button
        className={clipped ? 'clip on' : 'clip'}
        onClick={() => { resetClip(); setClipped(false); }}
        title="Clip indicator — click to reset"
      />
    </div>
  );
}
