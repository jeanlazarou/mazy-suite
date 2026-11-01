import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lyric, Theme } from '../types';

import './SplitFlapAnimation.css';

interface SplitFlapAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

// The characters each flap goes through, in this order, like a station board
const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,'!?-&:";
const ROWS = 6;
const FLIP_STEP = 55; // ms between two flaps of a cell
const BOARD_TIME = 9000; // ms a board stays before the next lines

const toBoardChar = (char: string) => {
  const plain = char.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return CHARSET.includes(plain) ? plain : ' ';
};

const centered = (text: string, columns: number) => {
  const left = Math.floor((columns - text.length) / 2);
  return (' '.repeat(left) + text).padEnd(columns, ' ');
};

// Lyrics word-wrapped to the board's width, a blank row between two lyrics,
// starting at `first`; returns the rows and the next lyric to show
const layoutBoard = (lyrics: Lyric[], first: number, columns: number) => {
  const rows: string[] = [];
  let next = first;

  for (let n = 0; n < lyrics.length && rows.length < ROWS; n++) {
    const words = lyrics[next].text.split(/\s+/).filter(Boolean).map(w => [...w].map(toBoardChar).join(''));
    const lines: string[] = [];
    for (const word of words) {
      const last = lines[lines.length - 1];
      if (last !== undefined && last.length + 1 + word.length <= columns) {
        lines[lines.length - 1] = `${last} ${word}`;
      } else {
        lines.push(word.slice(0, columns));
      }
    }
    const blank = rows.length > 0 ? 1 : 0;
    if (rows.length + blank + lines.length > ROWS && rows.length > 0) break;
    if (blank) rows.push('');
    rows.push(...lines.slice(0, ROWS - rows.length));
    next = (next + 1) % lyrics.length;
  }

  while (rows.length < ROWS) rows.push('');
  return { rows: rows.map(row => centered(row, columns)), next };
};

const SplitFlapAnimation: React.FC<SplitFlapAnimationProps> = ({ lyrics, theme }) => {
  const columns = useMemo(() => Math.max(12, Math.min(26, Math.floor(window.innerWidth / 64))), []);
  const cell = useMemo(
    () => Math.floor(Math.min((window.innerWidth * 0.92) / columns, (window.innerHeight * 0.8) / ROWS / 1.4)) - 4,
    [columns]
  );
  const blankBoard = useMemo(() => Array(ROWS).fill(' '.repeat(columns)), [columns]);

  const [shown, setShown] = useState<string[]>(blankBoard);
  const target = useRef<string[]>(blankBoard);

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#ffd166', '#ffffff', '#cccccc'];

  // A new board of lines every BOARD_TIME
  useEffect(() => {
    if (lyrics.length === 0) return;

    let next = 0;
    const showNextBoard = () => {
      const board = layoutBoard(lyrics, next, columns);
      target.current = board.rows;
      next = board.next;
    };

    showNextBoard();
    const interval = setInterval(showNextBoard, BOARD_TIME);
    return () => clearInterval(interval);
  }, [lyrics, columns]);

  // Every step, each cell not yet on its character flips to the next one;
  // some skip a step, so the board settles in a ripple rather than all at once
  useEffect(() => {
    const interval = setInterval(() => {
      setShown(previous => {
        let changed = false;
        const rows = previous.map((row, r) => {
          const wanted = target.current[r];
          if (row === wanted) return row;
          changed = true;
          return [...row].map((char, c) => {
            if (char === wanted[c] || Math.random() < 0.15) return char;
            return CHARSET[(CHARSET.indexOf(char) + 1) % CHARSET.length];
          }).join('');
        });
        return changed ? rows : previous;
      });
    }, FLIP_STEP);
    return () => clearInterval(interval);
  }, []);

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
      <div
        className="split-flap-board"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--cell))`,
          '--cell': `${cell}px`
        } as React.CSSProperties}
      >
        {shown.map((row, r) =>
          [...row].map((char, c) => (
            <div key={`${r}-${c}`} className="split-flap-cell" style={{ color: colors[r % colors.length] }}>
              <span key={char} className="split-flap-char">{char === ' ' ? ' ' : char}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SplitFlapAnimation;
