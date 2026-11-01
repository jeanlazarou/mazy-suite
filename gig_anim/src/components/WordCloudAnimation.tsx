import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface WordCloudAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface PlacedWord {
  word: string;
  size: number; // px
  x: number; // px from the center
  y: number;
  w: number; // px, the word's box
  h: number;
}

// Words that carry no song of their own
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'if', 'as', 'than', 'then',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'up', 'out', 'into',
  'i', 'me', 'my', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
  'we', 'us', 'our', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'have', 'has', 'had',
  "i'm", "it's", "you're", "don't", "can't", "i'll", "i've", "that's",
  'oh', 'ah', 'yeah', 'na', 'la', 'ooh',
]);
const MAX_WORDS = 45;
const FONT = 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif';
const REARRANGE_EVERY = 12000; // ms
const HIGHLIGHT_EVERY = 2500; // ms

const countWords = (lyrics: Lyric[]) => {
  const counts = new Map<string, number>();
  lyrics.forEach(lyric => {
    lyric.text.toLowerCase().split(/[^\p{L}\p{N}']+/u).forEach(raw => {
      const word = raw.replace(/^'+|'+$/g, '');
      if (word.length < 2 || STOP_WORDS.has(word)) return;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_WORDS);
};

// Biggest first, each word goes to the first free spot on a spiral around
// the center; `turn` rotates the spiral, giving another arrangement
const layoutCloud = (words: [string, number][], turn: number): PlacedWord[] => {
  const context = document.createElement('canvas').getContext('2d')!;
  const width = window.innerWidth * 0.92;
  const height = window.innerHeight * 0.88;
  const most = words[0]?.[1] ?? 1;
  const least = words[words.length - 1]?.[1] ?? 1;
  const minSize = Math.max(18, height / 28);
  const maxSize = Math.min(height / 5, width / 7);
  const placed: PlacedWord[] = [];

  for (const [word, count] of words) {
    const share = most === least ? 1 : (count - least) / (most - least);
    const size = minSize + (maxSize - minSize) * Math.sqrt(share);
    context.font = `700 ${size}px ${FONT}`;
    const w = context.measureText(word).width + 10;
    const h = size * 1.1;

    for (let t = 0; t < 600; t += 0.4) {
      const x = 4 * t * Math.cos(t + turn);
      const y = 2.6 * t * Math.sin(t + turn);
      const inside = Math.abs(x) + w / 2 < width / 2 && Math.abs(y) + h / 2 < height / 2;
      const free = placed.every(p => Math.abs(p.x - x) * 2 >= p.w + w || Math.abs(p.y - y) * 2 >= p.h + h);
      if (inside && free) {
        placed.push({ word, size, x, y, w, h });
        break;
      }
    }
  }
  return placed;
};

const WordCloudAnimation: React.FC<WordCloudAnimationProps> = ({ lyrics, theme }) => {
  const words = useMemo(() => countWords(lyrics), [lyrics]);
  const [turn, setTurn] = useState(0);
  const [highlighted, setHighlighted] = useState(-1);
  const placed = useMemo(() => layoutCloud(words, turn), [words, turn]);

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  useEffect(() => {
    const rearrange = setInterval(() => setTurn(Math.random() * Math.PI * 2), REARRANGE_EVERY);
    const highlight = setInterval(() => setHighlighted(Math.floor(Math.random() * MAX_WORDS)), HIGHLIGHT_EVERY);
    return () => {
      clearInterval(rearrange);
      clearInterval(highlight);
    };
  }, []);

  return (
    <div style={{
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {placed.map((p, index) => (
        <motion.div
          key={p.word}
          initial={{ x: p.x, y: p.y, opacity: 0, scale: 0.6 }}
          animate={{ x: p.x, y: p.y, opacity: 1, scale: index === highlighted ? 1.18 : 1 }}
          transition={{
            x: { duration: 4, ease: 'easeInOut' },
            y: { duration: 4, ease: 'easeInOut' },
            opacity: { duration: 1.5, delay: index * 0.05 },
            scale: { duration: 0.8 }
          }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            marginLeft: -p.w / 2,
            marginTop: -p.h / 2,
            width: p.w,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: p.size,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            color: colors[index % colors.length],
            textShadow: index === highlighted ? `0 0 ${p.size / 3}px ${colors[index % colors.length]}` : 'none'
          }}
        >
          {p.word}
        </motion.div>
      ))}
    </div>
  );
};

export default WordCloudAnimation;
