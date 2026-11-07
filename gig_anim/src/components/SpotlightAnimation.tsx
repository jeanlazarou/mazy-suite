import React from 'react';
import { motion, AnimatePresence, MotionStyle, useAnimationFrame, useMotionValue } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { sungPart, useSongTimeline } from '../hooks/useSongTimeline';

interface SpotlightAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  follow: boolean;
}

// The line in focus big, swept as it's sung, between the previous and the next
const SpotlightAnimation: React.FC<SpotlightAnimationProps> = ({ lyrics, theme, follow }) => {
  const { lines, focus, position } = useSongTimeline(lyrics, follow);
  const swept = useMotionValue('0%');

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#ffd166', '#cccccc'];

  useAnimationFrame(() => {
    swept.set(`${Math.round(sungPart(lines[focus], position()) * 1000) / 10}%`);
  });

  const lit = colors[Math.max(focus, 0) % colors.length];
  const dim = `color-mix(in srgb, ${lit} 30%, transparent)`;

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
                <motion.span style={{
                  '--swept': swept,
                  backgroundImage: `linear-gradient(90deg, ${lit} var(--swept), ${dim} var(--swept))`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent'
                } as MotionStyle}>
                  {lines[i].text}
                </motion.span>
              ) : lines[i].text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default SpotlightAnimation;
