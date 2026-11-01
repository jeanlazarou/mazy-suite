import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';
import { API_BASE_URL } from '../api/endpoints';

interface MosaicAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  album: Album;
}

const GRID = 5; // tiles per side
const BOARD = 'min(86vh, 86vw)';
const FLIP_STAGGER = 180; // ms between two tiles turning
const HOLD = 3500; // ms a line stays shown
const REST = 1500; // ms the cover stays whole between two lines

// The album cover cut into tiles; tiles turn over, in reading order, to show
// the words of a lyric line on their backs, then turn back to the cover
const MosaicAnimation: React.FC<MosaicAnimationProps> = ({ lyrics, theme, album }) => {
  const [words, setWords] = useState<string[]>(Array(GRID * GRID).fill(''));
  const [flipped, setFlipped] = useState<boolean[]>(Array(GRID * GRID).fill(false));

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);
  const cover = album?.coverImage ? `${API_BASE_URL}/${album.coverImage}` : null;

  useEffect(() => {
    if (lyrics.length === 0) return;

    let next = 0;
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, action: () => void) => timeouts.push(setTimeout(action, ms));

    const showLine = () => {
      timeouts = [];
      const lineWords = lyrics[next % lyrics.length].text.split(/\s+/).filter(Boolean).slice(0, GRID * GRID);
      next++;
      const start = Math.floor(Math.random() * (GRID * GRID - lineWords.length + 1));
      const tiles = lineWords.map((_, i) => start + i);

      setWords(previous => {
        const updated = [...previous];
        tiles.forEach((tile, i) => { updated[tile] = lineWords[i]; });
        return updated;
      });
      tiles.forEach((tile, i) => later(i * FLIP_STAGGER, () =>
        setFlipped(previous => previous.map((f, t) => (t === tile ? true : f)))));

      const shownAt = tiles.length * FLIP_STAGGER + HOLD;
      tiles.forEach((tile, i) => later(shownAt + i * FLIP_STAGGER, () =>
        setFlipped(previous => previous.map((f, t) => (t === tile ? false : f)))));

      later(shownAt + tiles.length * FLIP_STAGGER + REST, showLine);
    };

    later(REST, showLine);
    return () => timeouts.forEach(clearTimeout);
  }, [lyrics]);

  const face: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    borderRadius: 4
  };

  return (
    <div style={{
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: BOARD,
        height: BOARD,
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID}, 1fr)`,
        gap: 3,
        perspective: 1200
      }}>
        {words.map((word, tile) => {
          const row = Math.floor(tile / GRID);
          const column = tile % GRID;
          const color = colors[tile % colors.length];
          return (
            <motion.div
              key={tile}
              animate={{ rotateY: flipped[tile] ? 180 : 0 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
              style={{ position: 'relative', transformStyle: 'preserve-3d' }}
            >
              <div style={{
                ...face,
                background: cover
                  ? `url("${cover}") ${(column / (GRID - 1)) * 100}% ${(row / (GRID - 1)) * 100}% / ${GRID * 100}% ${GRID * 100}%`
                  : `linear-gradient(135deg, ${color}, ${theme.backgroundColor})`
              }} />
              <div style={{
                ...face,
                transform: 'rotateY(180deg)',
                background: color,
                color: theme.backgroundColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: `calc(${BOARD} / ${GRID} * ${Math.min(0.26, 1.5 / Math.max(word.length, 1))})`,
                textAlign: 'center',
                overflow: 'hidden'
              }}>
                {word}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MosaicAnimation;
