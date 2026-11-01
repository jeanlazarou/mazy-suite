import React, { useState, useEffect, useMemo } from 'react';
import { Lyric, Theme } from '../types';

interface NeonAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface Tube {
  char: string;
  on: boolean;
  settlesAt: number; // tick from which it stays on while warming up
  deadUntil: number; // tick until which a failing tube stays dark
}

const TICK = 70; // ms
const WARM_UP = 25; // ticks: letters flicker on one by one
const LIT = 110; // ticks the sign stays on
const SWITCH_OFF = 12; // ticks to go dark
const DARK = 10; // ticks between two signs

const NEON_COLORS = ['#ff2a6d', '#05d9e8', '#ff9f1c', '#7cff4f', '#c77dff', '#fdfd96'];

const glow = (color: string) =>
  `0 0 4px #fff, 0 0 10px ${color}, 0 0 22px ${color}, 0 0 44px ${color}, 0 0 80px ${color}`;

const NeonAnimation: React.FC<NeonAnimationProps> = ({ lyrics, theme }) => {
  const [line, setLine] = useState(0);
  const [tubes, setTubes] = useState<Tube[]>([]);

  const colors = useMemo(() => Array.isArray(theme.textColors) ? theme.textColors : NEON_COLORS, [theme.textColors]);
  const color = colors[line % colors.length];

  useEffect(() => {
    if (lyrics.length === 0) return;

    let tick = 0;
    let current = 0;
    const lightUp = (index: number) => {
      setLine(index);
      setTubes([...lyrics[index % lyrics.length].text].map(char => ({
        char,
        on: false,
        settlesAt: 3 + Math.floor(Math.random() * (WARM_UP - 3)),
        deadUntil: 0
      })));
    };
    lightUp(current);

    const interval = setInterval(() => {
      tick++;
      if (tick === WARM_UP + LIT + SWITCH_OFF + DARK) {
        tick = 0;
        lightUp(++current);
        return;
      }

      setTubes(previous => previous.map(tube => {
        if (tick < WARM_UP) {
          // Flickering to life: on and off until its moment, then on for good
          return { ...tube, on: tick >= tube.settlesAt || (tick > 1 && Math.random() < 0.25) };
        }
        if (tick < WARM_UP + LIT) {
          // Now and then a tube fails for a moment
          if (tick < tube.deadUntil) return tube;
          if (Math.random() < 0.004) return { ...tube, on: false, deadUntil: tick + 2 + Math.floor(Math.random() * 6) };
          return tube.on ? tube : { ...tube, on: true };
        }
        if (tick < WARM_UP + LIT + SWITCH_OFF) {
          return tube.on && Math.random() < 0.3 ? { ...tube, on: false } : tube;
        }
        return tube.on ? { ...tube, on: false } : tube;
      }));
    }, TICK);

    return () => clearInterval(interval);
  }, [lyrics]);

  const litShare = tubes.length ? tubes.filter(t => t.on).length / tubes.length : 0;

  return (
    <div style={{
      // The wall behind the sign takes some of its light
      background: `radial-gradient(ellipse at center, color-mix(in srgb, ${color} ${Math.round(litShare * 18)}%, transparent) 0%, transparent 60%), ${theme.backgroundColor}`,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: '85vw',
        textAlign: 'center',
        fontFamily: '"Avenir Next", Futura, "Trebuchet MS", sans-serif',
        fontSize: 'clamp(2.5rem, 7vw, 7rem)',
        fontWeight: 500,
        letterSpacing: '0.04em',
        lineHeight: 1.25
      }}>
        {tubes.map((tube, index) => (
          <span
            key={index}
            style={tube.on
              ? { color: '#fff', textShadow: glow(color) }
              : { color: 'rgba(255, 255, 255, 0.06)', textShadow: 'none' }}
          >
            {tube.char}
          </span>
        ))}
      </div>
    </div>
  );
};

export default NeonAnimation;
