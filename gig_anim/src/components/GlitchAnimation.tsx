import React, { useState, useEffect, useMemo } from 'react';
import { Lyric, Theme } from '../types';

interface GlitchAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface Burst {
  split: number; // px between the red and cyan copies
  slices: { top: number; height: number; shift: number }[]; // % and px
}

const TICK = 50; // ms between two frames of a burst
const LINE_TIME = 6000; // ms
const LINE_CHANGE_BURST = 600; // ms, the line changes halfway through

const randomBurst = (strength: number): Burst => ({
  split: (2 + Math.random() * 8) * strength,
  slices: Array.from({ length: 2 + Math.floor(Math.random() * 4 * strength) }, () => {
    const height = 3 + Math.random() * 18;
    return {
      top: Math.random() * (100 - height),
      height,
      shift: (Math.random() - 0.5) * 80 * strength
    };
  })
});

const GlitchAnimation: React.FC<GlitchAnimationProps> = ({ lyrics, theme }) => {
  const [line, setLine] = useState(0);
  const [burst, setBurst] = useState<Burst | null>(null);

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#e0e0e0'], [theme.textColors]);

  useEffect(() => {
    if (lyrics.length === 0) return;

    let frames: ReturnType<typeof setInterval> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;
    let change: ReturnType<typeof setTimeout> | undefined;

    // A burst redraws its glitch every TICK for `duration` ms
    const glitch = (duration: number, strength: number, halfway?: () => void) => {
      clearInterval(frames);
      clearTimeout(end);
      setBurst(randomBurst(strength));
      frames = setInterval(() => setBurst(randomBurst(strength)), TICK);
      if (halfway) change = setTimeout(halfway, duration / 2);
      end = setTimeout(() => {
        clearInterval(frames);
        setBurst(null);
      }, duration);
    };

    // Small bursts at random moments, a strong one to change the line
    let small: ReturnType<typeof setTimeout>;
    const scheduleSmall = () => {
      small = setTimeout(() => {
        glitch(120 + Math.random() * 300, 0.6);
        scheduleSmall();
      }, 1200 + Math.random() * 2300);
    };
    scheduleSmall();

    const lineChange = setInterval(() => glitch(LINE_CHANGE_BURST, 1.4, () => setLine(l => l + 1)), LINE_TIME);

    return () => {
      clearTimeout(small);
      clearInterval(lineChange);
      clearInterval(frames);
      clearTimeout(end);
      clearTimeout(change);
    };
  }, [lyrics]);

  const text = lyrics.length ? lyrics[line % lyrics.length].text : '';
  const color = colors[line % colors.length];
  const layer: React.CSSProperties = { position: 'absolute', inset: 0 };

  return (
    <div style={{
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }}>
      <div style={{
        position: 'relative',
        maxWidth: '85vw',
        textAlign: 'center',
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontWeight: 800,
        fontSize: 'clamp(2.5rem, 6vw, 6.5rem)',
        lineHeight: 1.1,
        textTransform: 'uppercase',
        color
      }}>
        <div style={{ opacity: burst ? 0.85 : 1 }}>{text}</div>
        {burst && (
          <>
            {/* Color channels pulled apart */}
            <div style={{ ...layer, color: '#ff004c', mixBlendMode: 'screen', transform: `translateX(${-burst.split}px)` }}>{text}</div>
            <div style={{ ...layer, color: '#00e5ff', mixBlendMode: 'screen', transform: `translateX(${burst.split}px)` }}>{text}</div>
            {/* Strips of the line shifted sideways */}
            {burst.slices.map((slice, i) => (
              <div key={i} style={{
                ...layer,
                background: theme.backgroundColor,
                clipPath: `inset(${slice.top}% 0 ${100 - slice.top - slice.height}% 0)`,
                transform: `translateX(${slice.shift}px)`
              }}>
                {text}
              </div>
            ))}
          </>
        )}
      </div>
      {/* Scanlines over everything */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(transparent 0 2px, rgba(0, 0, 0, 0.25) 2px 4px)'
      }} />
    </div>
  );
};

export default GlitchAnimation;
