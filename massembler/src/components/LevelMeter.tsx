import { useEffect, useRef, useState } from 'react';
import { readLevels } from '../utils/transport';

/** The quietest level the meter shows, in dB below full scale. */
const FLOOR_DB = -60;
/** How fast a bar falls back after a peak, so it can be read. */
const FALL_DB_PER_SECOND = 24;

const toDb = (peak: number) => (peak > 0 ? 20 * Math.log10(peak) : -Infinity);
const widthOf = (db: number) => Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));

/**
 * The output level, left and right, after the master volume. Drawn through
 * refs on each animation frame while playing, so it never re-renders the
 * transport bar; the clip light stays on until clicked, or playback restarts.
 */
export function LevelMeter({ active }: { active: boolean }) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const bars = [leftRef.current, rightRef.current];
    if (!active) {
      bars.forEach((bar) => bar && (bar.style.width = '0%'));
      return;
    }

    setClipped(false);
    const shown = [FLOOR_DB, FLOOR_DB];
    let last = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      readLevels().forEach((peak, channel) => {
        if (peak >= 1) setClipped(true);
        shown[channel] = Math.max(toDb(peak), shown[channel] - FALL_DB_PER_SECOND * elapsed);
        const bar = bars[channel];
        if (bar) bar.style.width = `${widthOf(shown[channel]) * 100}%`;
      });
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div
      className="flex items-center gap-1.5"
      title="Output level, left and right: green is comfortable, yellow loud, red close to full scale"
    >
      <div className="w-24 flex flex-col gap-0.5">
        {[leftRef, rightRef].map((ref, channel) => (
          <div key={channel} className="h-1.5 bg-gray-900 rounded-sm overflow-hidden">
            <div
              ref={ref}
              className="h-full"
              style={{
                width: '0%',
                // Sized to the whole meter, so a bar shows the colours of the
                // levels it reaches.
                background: 'linear-gradient(to right, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)',
                backgroundSize: '6rem 100%',
              }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => setClipped(false)}
        className={`w-2.5 h-2.5 rounded-full ${clipped ? 'bg-red-500' : 'bg-gray-700'}`}
        title={
          clipped
            ? 'The output clipped: turn the master or the loudest tracks down. Click to reset.'
            : 'Lights up if the output clips'
        }
        aria-label="Clip light"
      />
    </div>
  );
}
