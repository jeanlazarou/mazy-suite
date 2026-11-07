import React, { useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { useSongTimeline } from '../hooks/useSongTimeline';

interface ScatterAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  follow: boolean;
}

const LEAD = 0.4; // s: a line takes time to come together, it's whole on time

interface Flight {
  from: { x: number; y: number; rotate: number };
  to: { x: number; y: number; rotate: number };
}

const line: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.018 } },
  gone: { transition: { staggerChildren: 0.006 } }
};

const letter: Variants = {
  hidden: ({ from }: Flight) => ({ ...from, opacity: 0, scale: 0.4 }),
  shown: {
    x: 0, y: 0, rotate: 0, opacity: 1, scale: 1,
    transition: { type: 'spring', stiffness: 90, damping: 15 }
  },
  gone: ({ to }: Flight) => ({
    ...to, opacity: 0, scale: 1.5,
    transition: { duration: 0.8, ease: [0.15, 0.6, 0.35, 1] }
  })
};

// Each line flies together from letters scattered over the screen, and
// bursts apart when the next one comes
const ScatterAnimation: React.FC<ScatterAnimationProps> = ({ lyrics, theme, follow }) => {
  const { lines, focus } = useSongTimeline(lyrics, follow, LEAD);

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: theme.backgroundColor
    }}>
      <AnimatePresence>
        {lines[focus] && (
          <ScatteredLine key={focus} text={lines[focus].text} color={colors[focus % colors.length]} />
        )}
      </AnimatePresence>
    </div>
  );
};

const random = (spread: number) => (Math.random() * 2 - 1) * spread;

const ScatteredLine: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  // Each letter comes from anywhere, and goes away from the middle of the line
  const words = useMemo(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const count = text.replace(/\s/g, '').length;
    let index = 0;
    return text.split(/\s+/).filter(Boolean).map(word => [...word].map(char => {
      const side = count > 1 ? index++ / (count - 1) - 0.5 : 0;
      const flight: Flight = {
        from: { x: random(width * 0.6), y: random(height * 0.6), rotate: random(200) },
        to: { x: side * width * 0.9 + random(width * 0.15), y: random(height * 0.45), rotate: random(300) }
      };
      return { char, flight };
    }));
  }, [text]);

  return (
    <motion.div
      variants={line}
      initial="hidden"
      animate="shown"
      exit="gone"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div style={{
        maxWidth: '86vw',
        textAlign: 'center',
        fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
        fontWeight: 800,
        fontSize: 'clamp(2rem, 6vw, 6.5rem)',
        lineHeight: 1.15,
        color
      }}>
        {words.map((word, w) => (
          <React.Fragment key={w}>
            {w > 0 && ' '}
            <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
              {word.map(({ char, flight }, c) => (
                <motion.span key={c} custom={flight} variants={letter} style={{ display: 'inline-block' }}>
                  {char}
                </motion.span>
              ))}
            </span>
          </React.Fragment>
        ))}
      </div>
    </motion.div>
  );
};

export default ScatterAnimation;
