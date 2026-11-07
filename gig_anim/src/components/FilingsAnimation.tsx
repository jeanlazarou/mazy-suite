import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationFrame, useSpring } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { useSongTimeline } from '../hooks/useSongTimeline';

interface FilingsAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  follow: boolean;
}

const SPACING = 52; // px between two filings
const REACH = 260; // px: closer to the line, filings grow and brighten
const DRAWN = 12; // px a filing moves towards the line, at the most
const NEAR = 120; // px: closer, filings turn to the nearest letter, not the line's box
const MARGIN = 40; // px between the line and the screen edges
const DRIFT = { stiffness: 30, damping: 12 };

interface Rect { left: number; top: number; right: number; bottom: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Iron filings all over the screen, and the line in focus drifting among them
// as a magnet: the filings turn towards it, the nearest drawn to it
const FilingsAnimation: React.FC<FilingsAnimationProps> = ({ lyrics, theme, follow }) => {
  const { lines, focus } = useSongTimeline(lyrics, follow);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const filings = useRef<(HTMLDivElement | null)[]>([]);
  const lineSize = useRef<{ width: number; height: number } | null>(null);
  const letters = useRef<Rect[]>([]); // from the line's top left corner
  // The line's top left corner
  const x = useSpring(0, DRIFT);
  const y = useSpring(0, DRIFT);

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const places = useMemo(() => {
    const columns = Math.ceil(size.width / SPACING);
    const rows = Math.ceil(size.height / SPACING);
    return Array.from({ length: columns * rows }, (_, i) => ({
      x: (i % columns + 0.5) * SPACING,
      y: (Math.floor(i / columns) + 0.5) * SPACING
    }));
  }, [size]);

  useAnimationFrame(time => {
    const line = lineSize.current;
    if (!line) return;

    // A slow wander over the whole screen, as far as the line's size allows
    const seconds = time / 1000;
    const roomX = Math.max(0, size.width / 2 - line.width / 2 - MARGIN);
    const roomY = Math.max(0, size.height / 2 - line.height / 2 - MARGIN);
    x.set(size.width / 2 + roomX * Math.sin(seconds * 0.17) - line.width / 2);
    y.set(size.height / 2 + roomY * Math.sin(seconds * 0.23 + 1) - line.height / 2);

    const left = x.get();
    const top = y.get();

    places.forEach((place, i) => {
      const filing = filings.current[i];
      if (!filing) return;
      // Towards the nearest point of the line, of the nearest letter close to it
      const px = place.x - left;
      const py = place.y - top;
      let nx = clamp(px, 0, line.width);
      let ny = clamp(py, 0, line.height);
      if (Math.hypot(nx - px, ny - py) < NEAR) {
        let nearest = Infinity;
        for (const letter of letters.current) {
          const lx = clamp(px, letter.left, letter.right);
          const ly = clamp(py, letter.top, letter.bottom);
          const squared = (lx - px) ** 2 + (ly - py) ** 2;
          if (squared < nearest) {
            nearest = squared;
            nx = lx;
            ny = ly;
          }
        }
      }
      const dx = nx - px;
      const dy = ny - py;
      const distance = Math.hypot(dx, dy);
      // Under a letter
      if (distance === 0) {
        filing.style.opacity = '0';
        return;
      }
      const pull = 1 / (1 + (distance / REACH) ** 2);
      const drawn = (DRAWN * pull) / distance;
      filing.style.transform = `translate(${place.x + dx * drawn}px, ${place.y + dy * drawn}px)`
        + ` rotate(${Math.atan2(dy, dx)}rad) scaleX(${0.45 + 0.8 * pull})`;
      filing.style.opacity = String(0.12 + 0.8 * pull);
    });
  });

  // Its size, for the wander to keep it on the screen, and where its letters are
  const measure = (element: HTMLDivElement | null) => {
    if (!element) return;
    const first = !lineSize.current;
    lineSize.current = { width: element.offsetWidth, height: element.offsetHeight };
    const origin = element.getBoundingClientRect();
    letters.current = Array.from(element.querySelectorAll('[data-letter]'), letter => {
      const box = letter.getBoundingClientRect();
      // Roughly the ink: a letter's box has room above it and below
      return {
        left: box.left - origin.left,
        right: box.right - origin.left,
        top: box.top - origin.top + box.height * 0.2,
        bottom: box.bottom - origin.top - box.height * 0.12
      };
    });
    if (first) {
      x.jump((size.width - element.offsetWidth) / 2);
      y.jump((size.height - element.offsetHeight) / 2);
    }
  };

  const line = lines[focus];

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: theme.backgroundColor
    }}>
      {places.map((_, i) => (
        <div
          key={i}
          ref={filing => { filings.current[i] = filing; }}
          style={{
            position: 'absolute',
            left: -13,
            top: -1.5,
            width: 26,
            height: 3,
            borderRadius: 2,
            background: colors[i % colors.length],
            opacity: 0
          }}
        />
      ))}
      <motion.div style={{ position: 'absolute', left: 0, top: 0, x, y }}>
        {line && (
          <motion.div
            key={focus}
            ref={measure}
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.5 }}
            style={{
              width: 'max-content',
              maxWidth: '70vw',
              textAlign: 'center',
              fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(1.8rem, 4.5vw, 5rem)',
              lineHeight: 1.1,
              color: colors[focus % colors.length],
              textShadow: '0 0.04em 0.2em rgba(0, 0, 0, 0.5)'
            }}
          >
            {[...line.text].map((char, i) => char === ' ' ? ' ' : <span key={i} data-letter>{char}</span>)}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default FilingsAnimation;
