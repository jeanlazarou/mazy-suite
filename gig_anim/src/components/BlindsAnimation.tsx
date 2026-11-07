import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, stagger, useAnimate } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { useSongTimeline } from '../hooks/useSongTimeline';

interface BlindsAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  follow: boolean;
}

const SLATS = 10;
const LEAD = 0.9; // s: closing the blinds takes time, the line comes in on time
const OPEN = 90; // deg: slats edge on
const TURN = 0.07; // s from one slat to the next

// Any colour of the theme but the current one
const pickColor = (colors: string[], current?: string) => {
  const others = colors.filter(color => color !== current);
  const choice = others.length > 0 ? others : colors;
  return choice[Math.floor(Math.random() * choice.length)];
};

// At each new line the blinds close, slat after slat from the top, in a new
// colour, the line behind them changes, and they open on the new one
const BlindsAnimation: React.FC<BlindsAnimationProps> = ({ lyrics, theme, follow }) => {
  const { lines, focus } = useSongTimeline(lyrics, follow, LEAD);
  const [shown, setShown] = useState(-1);
  const [scope, animate] = useAnimate();

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);
  const [slatColor, setSlatColor] = useState(() => pickColor(colors));
  const opened = useRef(false);

  useEffect(() => {
    if (focus < 0) return;
    let replaced = false;
    // Changed while the slats are open, edge on: it shows as they close
    if (opened.current) setSlatColor(current => pickColor(colors, current));
    opened.current = true;
    (async () => {
      await animate('.blind', { rotateX: 0 },
        { duration: 0.6, ease: 'easeIn', delay: stagger(TURN) });
      if (replaced) return;
      setShown(focus);
      await animate('.blind', { rotateX: OPEN },
        { duration: 0.8, ease: 'easeOut', delay: stagger(TURN, { startDelay: 0.25 }) });
    })();
    return () => { replaced = true; };
  }, [focus, animate, colors]);

  const line = lines[shown];

  return (
    <div ref={scope} style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: theme.backgroundColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {line && (
        <div style={{
          maxWidth: '86vw',
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 6vw, 6.5rem)',
          lineHeight: 1.1,
          color: colors[shown % colors.length]
        }}>
          {line.text}
        </div>
      )}
      {/* Closed to start with: they open on the first line. Each in its own
          perspective, to vanish edge on wherever it is on the screen */}
      {Array.from({ length: SLATS }, (_, i) => (
        <motion.div
          key={i}
          className="blind"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(100 / SLATS) * i}%`,
            height: `${100 / SLATS + 0.2}%`,
            background: `linear-gradient(to bottom, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.35)), ${slatColor}`,
            rotateX: 0,
            transformPerspective: 1400
          }}
        />
      ))}
    </div>
  );
};

export default BlindsAnimation;
