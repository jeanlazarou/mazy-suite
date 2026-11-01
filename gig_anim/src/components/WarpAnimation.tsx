import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lyric, Theme } from '../types';

import './WarpAnimation.css';

interface WarpAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface WarpLine {
  id: number;
  text: string;
  x: number; // px off the vanishing point
  y: number;
  color: string;
}

const LINE_EVERY = 1300; // ms
const TRAVEL = 6; // s from the far end to past the audience
const FAR = -2400; // px: further, a line is only a speck for most of its trip
const PAST = 700; // px, with an 800px perspective: 8 times bigger, off screen
const STARS = 70;

const WarpAnimation: React.FC<WarpAnimationProps> = ({ lyrics, theme }) => {
  const [lines, setLines] = useState<WarpLine[]>([]);

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);

  // Each star keeps its own lane and pace; spread out so the field starts full
  const stars = useMemo(() => Array.from({ length: STARS }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 500;
    const duration = 2 + Math.random() * 3;
    return {
      id: i,
      style: {
        '--x': `${Math.cos(angle) * radius}px`,
        '--y': `${Math.sin(angle) * radius * 0.7}px`,
        animationDuration: `${duration}s`,
        animationDelay: `${-Math.random() * duration}s`,
        color: colors[i % colors.length]
      } as React.CSSProperties
    };
  }), [colors]);

  useEffect(() => {
    if (lyrics.length === 0) return;

    let next = 0;
    const launch = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 120 + Math.random() * 280;
      const line: WarpLine = {
        id: next,
        text: lyrics[next % lyrics.length].text,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.6,
        color: colors[next % colors.length]
      };
      next++;
      // Enough to keep every line until it has flown past
      setLines(previous => [...previous, line].slice(-Math.ceil((TRAVEL * 1000) / LINE_EVERY) - 1));
    };

    launch();
    const interval = setInterval(launch, LINE_EVERY);
    return () => clearInterval(interval);
  }, [lyrics, colors]);

  return (
    <div className="warp-space" style={{ background: theme.backgroundColor }}>
      <div className="warp-anchor">
        {stars.map(star => <div key={star.id} className="warp-star" style={star.style} />)}
        {lines.map(line => (
          <motion.div
            key={line.id}
            className="warp-anchor"
            initial={{ x: line.x, y: line.y, z: FAR, opacity: 0 }}
            animate={{ z: PAST, opacity: [0, 1, 1, 0] }}
            transition={{
              z: { duration: TRAVEL, ease: [0.4, 0, 1, 1] },
              opacity: { duration: TRAVEL, times: [0, 0.15, 0.9, 1] }
            }}
          >
            <div className="warp-line" style={{ color: line.color }}>{line.text}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default WarpAnimation;
