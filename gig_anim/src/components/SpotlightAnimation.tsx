import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { useExternalCommands } from '../context/ExternalCommandsContext';

interface SpotlightAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

const FRAME = 50; // ms between two looks at the clock

// The line being sung, big and swept as it goes, between the previous and the
// next ones. In time with the linked prompter; without one, the song is taken
// to start when the animation shows.
const SpotlightAnimation: React.FC<SpotlightAnimationProps> = ({ lyrics, theme }) => {
  const { prompterClock } = useExternalCommands();
  const startedAt = useRef(performance.now());
  const [position, setPosition] = useState(0);
  const lines = useMemo(() => [...lyrics].sort((a, b) => a.start - b.start), [lyrics]);

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#ffd166', '#cccccc'];

  useEffect(() => {
    const interval = setInterval(() => {
      const clock = prompterClock.current;
      const now = performance.now();
      setPosition(clock
        ? clock.position + (clock.playing ? (now - clock.receivedAt) / 1000 : 0)
        : (now - startedAt.current) / 1000);
    }, FRAME);
    return () => clearInterval(interval);
  }, [prompterClock]);

  // In focus: the line being sung, else the next to come, else the last one
  const singing = lines.findIndex(line => line.start <= position && position < line.end);
  const upcoming = lines.findIndex(line => line.start > position);
  const focus = singing !== -1 ? singing : upcoming !== -1 ? upcoming : lines.length - 1;
  const focused = lines[focus];
  const progress = !focused ? 0
    : singing !== -1 ? (position - focused.start) / (focused.end - focused.start)
    : position >= focused.end ? 1 : 0;

  const lit = colors[Math.max(focus, 0) % colors.length];
  const dim = `color-mix(in srgb, ${lit} 30%, transparent)`;
  const swept = Math.round(progress * 1000) / 10;

  return (
    <div style={{
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <AnimatePresence initial={false} mode="popLayout">
        {[focus - 1, focus, focus + 1].filter(i => i >= 0 && i < lines.length).map(i => {
          const role = i < focus ? 'previous' : i === focus ? 'focus' : 'next';
          return (
            <motion.div
              key={i}
              layout="position"
              initial={{ opacity: 0, y: 80 }}
              animate={{
                opacity: role === 'focus' ? 1 : role === 'next' ? 0.45 : 0.22,
                scale: role === 'focus' ? 1 : 0.55,
                y: 0
              }}
              exit={{ opacity: 0, y: -80 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                maxWidth: '88vw',
                margin: '0.3em 0',
                textAlign: 'center',
                fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
                fontWeight: 800,
                fontSize: 'clamp(2rem, 5vw, 5.5rem)',
                lineHeight: 1.15,
                color: role === 'focus' ? undefined : lit
              }}
            >
              {role === 'focus' ? (
                <span style={{
                  backgroundImage: `linear-gradient(90deg, ${lit} ${swept}%, ${dim} ${swept}%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent'
                }}>
                  {lines[i].text}
                </span>
              ) : lines[i].text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default SpotlightAnimation;
