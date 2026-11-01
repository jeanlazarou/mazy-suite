import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface EchoAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface EchoLine {
  id: number;
  text: string;
  x: number; // vw
  y: number; // vh
  dx: number; // vw per repeat
  dy: number; // vh per repeat
  color: string;
}

// Like a delay pedal: each repeat comes ECHO_TIME later, quieter (FEEDBACK),
// smaller and a little further along
const ECHOES = 6;
const ECHO_TIME = 0.35; // s
const FEEDBACK = 0.62;
const LINE_EVERY = 3500; // ms
const LIFETIME = 7; // s each repeat stays

const EchoAnimation: React.FC<EchoAnimationProps> = ({ lyrics, theme }) => {
  const [lines, setLines] = useState<EchoLine[]>([]);

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);

  useEffect(() => {
    if (lyrics.length === 0) return;

    let next = 0;
    const addLine = () => {
      const angle = Math.random() * Math.PI * 2;
      const line: EchoLine = {
        id: next,
        text: lyrics[next % lyrics.length].text,
        // Away from the edge the repeats drift towards
        x: Math.cos(angle) > 0 ? 6 + Math.random() * 25 : 35 + Math.random() * 25,
        y: Math.sin(angle) > 0 ? 8 + Math.random() * 25 : 45 + Math.random() * 25,
        dx: Math.cos(angle) * 4,
        dy: Math.sin(angle) * 6,
        color: colors[next % colors.length]
      };
      next++;
      // A line lasts LIFETIME plus its last repeat's delay: keep the ones alive
      setLines(previous => [...previous, line].slice(-3));
    };

    addLine();
    const interval = setInterval(addLine, LINE_EVERY);
    return () => clearInterval(interval);
  }, [lyrics, colors]);

  return (
    <div style={{
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {lines.map(line =>
        Array.from({ length: ECHOES }, (_, repeat) => {
          const level = Math.pow(FEEDBACK, repeat);
          return (
            <motion.div
              key={`${line.id}-${repeat}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, level, level, 0] }}
              transition={{ duration: LIFETIME, delay: repeat * ECHO_TIME, times: [0, 0.05, 0.7, 1] }}
              style={{
                position: 'absolute',
                left: `${line.x + line.dx * repeat}vw`,
                top: `${line.y + line.dy * repeat}vh`,
                maxWidth: '50vw',
                color: line.color,
                fontSize: `${2.6 * (1 - repeat * 0.08)}rem`,
                fontWeight: 600,
                filter: repeat > 0 ? `blur(${repeat * 0.7}px)` : undefined,
                zIndex: ECHOES - repeat,
                whiteSpace: 'normal'
              }}
            >
              {line.text}
            </motion.div>
          );
        })
      )}
    </div>
  );
};

export default EchoAnimation;
